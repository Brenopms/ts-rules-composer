import type { Decision, OutcomeOf } from "../src/lib";
import { defineOutcomes } from "../src/lib";

// Types
type Category = "news" | "ads" | "politics" | "adult" | "other";

type Post = {
  id: string;
  category: Category;
  text: string;
  hasImage: boolean;
  authorStrikes: number;
};

// Mock classifier services (independent, each a network call)
const toxicityService = {
  score: async (_text: string) => 0.1,
};

const spamService = {
  isSpam: async (_post: Post) => false,
};

const imageService = {
  nsfwScore: async (_postId: string) => 0.05,
};

// 1. The outcome set. Order is precedence: "remove" outranks "review",
//    which outranks "allow". A failure caught by a decision combinator
//    becomes "review" (a human looks), and onErrorCaught sees the error,
//    so an outage is logged instead of silently hidden. The hook says only
//    that a check failed: a stronger outcome from another check ("remove")
//    can still decide the post.
const moderation = defineOutcomes(["remove", "review", "allow"], {
  onError: "review",
  onErrorCaught: (error) =>
    console.warn("moderation: check failed:", String(error)),
});
type ModerationOutcome = OutcomeOf<typeof moderation>; // "remove" | "review" | "allow"

// 2. Hand-written decisions: each classifier turns a score into an outcome.
//    Two styles: toxicity annotates its type, so `post` is inferred and
//    the thresholds are checked against ModerationOutcome; spam annotates
//    only its parameter and lets the return type be inferred.
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

// 3. A post without an image never calls the image service.
const imageCheck = moderation.ifElse(
  (post: Post) => post.hasImage,
  nsfwImage,
  "allow",
);

// 4. The classifiers are independent, so they run in parallel. combineAll
//    waits for all of them and merges in declaration order, whatever order
//    they finish in. A classifier that throws becomes "review" (onError).
const classifiers = moderation.combineAll([toxicity, spam, imageCheck]);

// 5. Category rules: bare outcome strings for fixed answers, nested
//    decisions where the answer depends on the author. Any category
//    without a case (here "other") uses the required default. The nested
//    predicates need no annotation: `post` is typed from the accessor.
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

// 6. The full policy. Sequential: the strongest outcome wins, and the run
//    stops at "remove", so a post removed by category never reaches the
//    paid classifiers.
const moderatePost = moderation.combine([byCategory, classifiers]);

// Example usage
(async () => {
  const post: Post = {
    id: "post-1",
    category: "news",
    text: "City council approves new park",
    hasImage: true,
    authorStrikes: 0,
  };

  // { outcome: "allow" }
  console.log(await moderatePost(post));

  // { outcome: "remove" } (adult category; classifiers never called)
  console.log(await moderatePost({ ...post, category: "adult" }));

  // { outcome: "review" } (politics from an author with a strike)
  console.log(
    await moderatePost({ ...post, category: "politics", authorStrikes: 1 }),
  );

  // { outcome: "remove" } (toxicity classifier score above 0.9)
  const score = toxicityService.score;
  toxicityService.score = async () => 0.95;
  console.log(await moderatePost(post));
  toxicityService.score = score;

  // moderation: check failed: Error: toxicity service unavailable
  // { outcome: "review" } (toxicity classifier down -> onError)
  toxicityService.score = async () => {
    throw new Error("toxicity service unavailable");
  };
  console.log(await moderatePost(post));
  toxicityService.score = score;

  // moderation: check failed: Error: toxicity service unavailable
  // { outcome: "remove" } (spam wins over the outage: "remove" outranks "review")
  toxicityService.score = async () => {
    throw new Error("toxicity service unavailable");
  };
  spamService.isSpam = async () => true;
  console.log(await moderatePost({ ...post, hasImage: false }));
})();
