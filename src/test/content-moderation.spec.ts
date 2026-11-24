import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Decision, defineOutcomes, type OutcomeOf } from "../lib";

// Types
type Category = "news" | "ads" | "politics" | "adult" | "other";

type Post = {
  id: string;
  category: Category;
  text: string;
  hasImage: boolean;
  authorStrikes: number;
};

// Mock classifier services
const toxicityService = { score: vi.fn<(text: string) => Promise<number>>() };
const spamService = { isSpam: vi.fn<(post: Post) => Promise<boolean>>() };
const imageService = {
  nsfwScore: vi.fn<(postId: string) => Promise<number>>(),
};
const onErrorCaught = vi.fn<(error: unknown) => void>();

// Policy (copy of examples/content-moderation.example.ts)
const moderation = defineOutcomes(["remove", "review", "allow"], {
  onError: "review",
  onErrorCaught,
});
type ModerationOutcome = OutcomeOf<typeof moderation>;

const toxicity: Decision<Post, ModerationOutcome> = async (post) => {
  const score = await toxicityService.score(post.text);
  if (score > 0.9) {
    return moderation.outcome("remove");
  }
  if (score > 0.6) {
    return moderation.outcome("review");
  }
  return moderation.outcome("allow");
};

const spam = async (post: Post) =>
  moderation.outcome((await spamService.isSpam(post)) ? "remove" : "allow");

const nsfwImage: Decision<Post, ModerationOutcome> = async (post) =>
  moderation.outcome(
    (await imageService.nsfwScore(post.id)) > 0.8 ? "remove" : "allow",
  );

const imageCheck = moderation.ifElse(
  (post: Post) => post.hasImage,
  nsfwImage,
  "allow",
);

const classifiers = moderation.combineAll([toxicity, spam, imageCheck]);

const byCategory = moderation.match(
  (post: Post) => post.category,
  {
    adult: "remove",
    news: "allow",
    politics: moderation.ifElse(
      (post) => post.authorStrikes > 0,
      "review",
      "allow",
    ),
    ads: moderation.ifElse(
      (post) => post.authorStrikes >= 3,
      "remove",
      "review",
    ),
  },
  "allow",
);

const moderatePost = moderation.combine([byCategory, classifiers]);

const delay = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("content-moderation decision", () => {
  const post: Post = {
    id: "post-1",
    category: "news",
    text: "City council approves new park",
    hasImage: true,
    authorStrikes: 0,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    toxicityService.score.mockResolvedValue(0.1);
    spamService.isSpam.mockResolvedValue(false);
    imageService.nsfwScore.mockResolvedValue(0.05);
  });

  it("exposes the declared outcome set and onError", () => {
    expect(moderation.outcomes).toEqual(["remove", "review", "allow"]);
    expect(moderation.onError).toBe("review");
  });

  it("allows a clean news post after running every classifier", async () => {
    expect(await moderatePost(post)).toEqual({ outcome: "allow" });
    expect(toxicityService.score).toHaveBeenCalledWith(post.text);
    expect(spamService.isSpam).toHaveBeenCalledWith(post);
    expect(imageService.nsfwScore).toHaveBeenCalledWith(post.id);
    expect(onErrorCaught).not.toHaveBeenCalled();
  });

  describe("match on category", () => {
    it("removes adult posts and stops before the classifiers", async () => {
      expect(await moderatePost({ ...post, category: "adult" })).toEqual({
        outcome: "remove",
      });
      expect(toxicityService.score).not.toHaveBeenCalled();
      expect(spamService.isSpam).not.toHaveBeenCalled();
      expect(imageService.nsfwScore).not.toHaveBeenCalled();
    });

    it("sends politics from an author with a strike to review", async () => {
      expect(
        await moderatePost({ ...post, category: "politics", authorStrikes: 1 }),
      ).toEqual({ outcome: "review" });
      // "review" is not final, so the classifiers still run
      expect(toxicityService.score).toHaveBeenCalledOnce();
    });

    it("allows politics from an author without strikes", async () => {
      expect(await moderatePost({ ...post, category: "politics" })).toEqual({
        outcome: "allow",
      });
    });

    it("reviews ads, and removes ads from an author with 3 strikes", async () => {
      expect(await moderatePost({ ...post, category: "ads" })).toEqual({
        outcome: "review",
      });
      expect(
        await moderatePost({ ...post, category: "ads", authorStrikes: 3 }),
      ).toEqual({ outcome: "remove" });
    });

    it("uses the default for a category without a case", async () => {
      expect(await byCategory({ ...post, category: "other" })).toEqual({
        outcome: "allow",
      });
    });
  });

  describe("combineAll over the classifiers", () => {
    it("reviews a borderline toxicity score", async () => {
      toxicityService.score.mockResolvedValue(0.7);
      expect(await moderatePost(post)).toEqual({ outcome: "review" });
    });

    it("removes on a high toxicity score", async () => {
      toxicityService.score.mockResolvedValue(0.95);
      expect(await moderatePost(post)).toEqual({ outcome: "remove" });
    });

    it("removes spam and NSFW images", async () => {
      spamService.isSpam.mockResolvedValue(true);
      expect(await moderatePost(post)).toEqual({ outcome: "remove" });

      spamService.isSpam.mockResolvedValue(false);
      imageService.nsfwScore.mockResolvedValue(0.9);
      expect(await moderatePost(post)).toEqual({ outcome: "remove" });
    });

    it("skips the image service for a post without an image", async () => {
      imageService.nsfwScore.mockResolvedValue(0.9);
      expect(await moderatePost({ ...post, hasImage: false })).toEqual({
        outcome: "allow",
      });
      expect(imageService.nsfwScore).not.toHaveBeenCalled();
    });

    it("starts every classifier before any finishes", async () => {
      toxicityService.score.mockReturnValue(delay(20, 0.1));
      spamService.isSpam.mockReturnValue(delay(20, false));
      const running = classifiers(post);
      expect(toxicityService.score).toHaveBeenCalledOnce();
      expect(spamService.isSpam).toHaveBeenCalledOnce();
      expect(await running).toEqual({ outcome: "allow" });
    });

    it("merges by precedence whatever order the classifiers finish in", async () => {
      // the first-declared classifier finishes last
      toxicityService.score.mockReturnValue(delay(30, 0.7));
      spamService.isSpam.mockReturnValue(delay(0, true));
      expect(await classifiers(post)).toEqual({ outcome: "remove" });

      toxicityService.score.mockReturnValue(delay(30, 0.95));
      spamService.isSpam.mockReturnValue(delay(0, false));
      imageService.nsfwScore.mockReturnValue(delay(10, 0.5));
      expect(await classifiers(post)).toEqual({ outcome: "remove" });
    });
  });

  describe("outages", () => {
    it("sends a post to review when a classifier is down, and reports the error once", async () => {
      const outage = new Error("toxicity service unavailable");
      toxicityService.score.mockRejectedValue(outage);

      expect(await moderatePost(post)).toEqual({ outcome: "review" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught).toHaveBeenCalledWith(outage);
      // the other classifiers still ran
      expect(spamService.isSpam).toHaveBeenCalledOnce();
      expect(imageService.nsfwScore).toHaveBeenCalledOnce();
    });

    it("lets a stronger classifier result win over an outage", async () => {
      toxicityService.score.mockRejectedValue(new Error("down"));
      spamService.isSpam.mockResolvedValue(true);
      expect(await moderatePost(post)).toEqual({ outcome: "remove" });
      expect(onErrorCaught).toHaveBeenCalledOnce();
    });

    it("reports a malformed classifier result as a TypeError", async () => {
      // a hand-written classifier that returns a label outside the set
      const broken: Decision<Post, ModerationOutcome> = async () =>
        ({ outcome: "delete" }) as unknown as { outcome: ModerationOutcome };
      expect(await moderation.combineAll([broken])(post)).toEqual({
        outcome: "review",
      });
      expect(onErrorCaught).toHaveBeenCalledWith(expect.any(TypeError));
    });

    it("never rejects, even when every service is down", async () => {
      toxicityService.score.mockRejectedValue(new Error("down"));
      spamService.isSpam.mockRejectedValue(new Error("down"));
      imageService.nsfwScore.mockRejectedValue(new Error("down"));
      await expect(moderatePost(post)).resolves.toEqual({ outcome: "review" });
      expect(onErrorCaught).toHaveBeenCalledTimes(3);
    });
  });
});
