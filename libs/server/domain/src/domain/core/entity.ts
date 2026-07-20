export interface Entity<Identity = string, Description = unknown> {
  identity(): Identity;
  description(): Description;
}
