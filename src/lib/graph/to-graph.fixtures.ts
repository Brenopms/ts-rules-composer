import { fail, pass, type Rule } from "../index";

export type Order = { items: number; total: number };

export const hasItems: Rule<Order> = (order) =>
  order.items > 0 ? pass() : fail("Cart is empty");
export const withinLimit: Rule<Order> = (order) =>
  order.total <= 1000 ? pass() : fail("Over the limit");
export const positive: Rule<number> = (n) =>
  n > 0 ? pass() : fail("Not positive");
export const getTotal = (order: Order) => order.total;
export const isRetryable = (error: string) => error === "Over the limit";
export const logOrder = (_order: Order) => {};
export const anyOrder: Rule<Order> = () => pass();
export const isLarge = (order: Order) => order.total > 500;
