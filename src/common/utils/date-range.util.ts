import { Between, LessThanOrEqual, MoreThanOrEqual, type FindOperator } from "typeorm";

/** A `yyyy-mm-dd` names a whole day, so the bounds are its first and last instant in
 *  UTC. Taking the bare date would silently exclude everything after midnight. */
const startOfDay = (date: string) => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);

/** One operator from two optional bounds. Undefined when neither was sent, so a column
 *  nobody filtered on adds no condition. */
export function dateRange(
  from: string | undefined,
  to: string | undefined,
): FindOperator<Date> | undefined {
  if (from && to) return Between(startOfDay(from), endOfDay(to));
  if (from) return MoreThanOrEqual(startOfDay(from));
  if (to) return LessThanOrEqual(endOfDay(to));
  return undefined;
}
