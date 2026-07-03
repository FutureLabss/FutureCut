import { nanoid } from "nanoid";

/** Generate a unique ID for project entities */
export function generateId(): string {
  return nanoid();
}
