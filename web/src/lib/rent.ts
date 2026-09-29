import "server-only";
import { qc } from "./db";

/** One CBS rooms group in one city: latest average rent and gross yield against local sale prices. */
export type RentRow = {
  loc: number;
  rooms: RoomsGroup;
  rent_q: string;
  rent: number;
  se: number | null;
  rent_change: number | null;
  n_sales: number | null;
  med_price: number | null;
  med_area: number | null;
  gross_yield: number | null;
};

export type RoomsGroup = "1-2" | "2.5-3" | "3.5-4" | "4.5+";

const COLS = `loc, rooms, rent_q, rent, se, rent_change, n_sales, med_price, med_area, gross_yield`;

export const rentForCity = (loc: number) =>
  qc<RentRow>(`SELECT ${COLS} FROM rent_yield WHERE loc = $loc ORDER BY rooms`, { loc });

export const rentAllCities = () =>
  qc<RentRow & { name_he: string; name_en: string | null }>(
    `SELECT ${COLS}, l.name_he, l.name_en FROM rent_yield JOIN localities l ON l.code = rent_yield.loc ORDER BY loc, rooms`,
  );

/** The CBS rooms group a room count falls in (the price check's 2 / 3 / 4 / 5 / 6+ buttons). */
export function roomsGroup(rooms: number): RoomsGroup {
  return rooms <= 2 ? "1-2" : rooms <= 3 ? "2.5-3" : rooms <= 4 ? "3.5-4" : "4.5+";
}
