import { generateId as generateSnowflakeId, type SnowflakeOptions } from "snowflake.io";

export const ID_PREFIXES = ["ast", "tsk", "usg"] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

export interface IdGenerator {
  next(prefix: IdPrefix): string;
  validate(id: string, expectedPrefix?: IdPrefix): boolean;
}

const ID_PATTERN = /^(ast|tsk|usg)[0-9]+$/;

const SNOWFLAKE_OPTIONS = {
  clockSkewHandler: "throw",
  id: 0,
} satisfies SnowflakeOptions;

export class SnowflakeIdGenerator implements IdGenerator {
  next(prefix: IdPrefix): string {
    return `${prefix}${generateSnowflakeId(SNOWFLAKE_OPTIONS)}`;
  }

  validate(id: string, expectedPrefix?: IdPrefix): boolean {
    if (!ID_PATTERN.test(id)) {
      return false;
    }

    return expectedPrefix === undefined || id.startsWith(expectedPrefix);
  }
}

