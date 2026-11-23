declare const __EXTENSION_URL__: string;

declare module "virtual:card-fixtures" {
  const records: import("../../src/record").DailyRecord[];
  export default records;
}
