// Shared domain types mirroring the database schema.

export type HolderType = "current_employee" | "ex_employee";
export type BatchStatus = "active" | "voided";
export type ResponseMode = "percentage" | "binary";
export type ChangeType = "created" | "modified" | "withdrawn";

export interface Holder {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  holder_type: HolderType;
  ordinary_shares: number;
  nda_accepted_at: string | null;
  data_as_of: string | null;
  // BSPCE 2026 extensions
  employee_status: string | null;
  is_founder: boolean;
  matricule: string | null;
  matera_email: string | null;
  contract_start_date: string | null;
  needs_review: boolean;
  has_login_email: boolean;
  access_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  holder_id: string;
  batch_name: string | null;
  strike_price: number;
  quantity: number;
  is_vested: boolean;
  status: BatchStatus;
  attribution_date?: string | null;
  expiration_date?: string | null;
  delegation?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface DepartureTracking {
  holder_id: string;
  uplaw_id: string | null;
  gender: string | null;
  postal_address: string | null;
  departure_date: string | null;
  departure_cause: string | null;
  theoretical_deadline: string | null;
  exercise_deadline: string | null;
  bspce_granted: number | null;
  bspce_vested_at_notif: number | null;
  price_label: string | null;
  no_extension: boolean;
  admin_status: Record<string, unknown> | null;
}

export interface SurveyResponse {
  id: string;
  holder_id: string;
  response_mode: ResponseMode;
  percentage_to_sell: number | null;
  accepts_full_sale: boolean | null;
  submitted_at: string;
  last_modified_at: string;
  ip_address: string | null;
  user_agent: string | null;
  edit_unlocked?: boolean;
}

export type ModificationStatus = "pending" | "approved" | "rejected";

export interface ModificationRequest {
  holder_id: string;
  status: ModificationStatus;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface HolderOverride {
  holder_id: string;
  custom_price_current: number | null;
  custom_price_ex_vested: number | null;
  custom_price_ex_unvested: number | null;
  custom_max_pct: number | null;
  note: string;
  created_at: string;
  created_by: string | null;
}

// admin_settings flattened into a typed bag (all values are strings or null).
export interface Settings {
  sale_price_current_employees: string | null;
  sale_price_current_employees_max: string | null;
  sale_price_ex_employees_vested: string | null;
  sale_price_ex_employees_vested_max: string | null;
  sale_price_ex_employees_unvested: string | null;
  sale_price_ex_employees_unvested_max: string | null;
  min_pct_current_employees: string | null;
  max_pct_current_employees: string | null;
  max_pct_ex_employees: string | null;
  ex_employees_all_or_nothing: string | null;
  survey_open: string | null;
  survey_deadline: string | null;
  webinar_info: string | null;
  support_email: string | null;
  data_last_refreshed_at: string | null;
  test_mode: string | null;
  faq_markdown: string | null;
  // Responses submitted before this ISO timestamp are ignored (internal tests).
  responses_cutoff_at: string | null;
  // Explicit holder IDs whose responses are ignored (comma-separated test accounts).
  responses_excluded_holders: string | null;
}

export type SettingKey = keyof Settings;
