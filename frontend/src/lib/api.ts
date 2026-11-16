export type BucketType = "day_to_day" | "short_term_debt" | "savings" | "retirement";

export interface Account {
  id: string;
  institution: string;
  name: string;
  custom_name?: string | null;
  bucket: BucketType;
  account_role?: string | null;
  low_balance_threshold?: number | null;
  current_balance: number;
  available_balance?: number | null;
  credit_limit?: number | null;
  statement_due_day?: number | null;
  include_in_cashflow: boolean;
  last_synced_at: string;
}

export interface BucketSummary {
  bucket: BucketType;
  total_balance: number;
  account_count: number;
  accounts: Account[];
}

export interface CheckingAccountDetail {
  id: string;
  name: string;
  custom_name?: string | null;
  institution: string;
  account_role: string; // primary_spend, mortgage, bills_subs, general
  current_balance: number;
  inflow_30d: number;
  outflow_30d: number;
  net_cashflow: number;
  low_balance_threshold: number;
  low_balance_alert: boolean;
  negative_cashflow_alert: boolean;
  next_bill_amount?: number | null;
  next_bill_name?: string | null;
  next_bill_date?: string | null;
  insufficient_funds_for_bill: boolean;
  warnings: string[];
}

export interface BurnRateMetric {
  monthly_outflow: number;
  monthly_inflow: number;
  daily_burn_rate: number;
  burn_rate_pct: number;
  safe_daily_spend: number;
  status: "normal" | "warning" | "critical";
  status_message: string;
  days_remaining_in_month: number;
}

export interface DailyCashflowPoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface BillCalendarItem {
  id: string;
  title: string;
  expected_amount: number;
  due_date: string;
  days_until: number;
  frequency: string;
  status: "due_today" | "due_soon" | "upcoming";
  matched_account_id?: string | null;
  is_funded: boolean;
}

export interface MetricsSummary {
  day_to_day_balance: number;
  short_term_debt_balance: number;
  savings_balance: number;
  retirement_balance: number;
  true_safe_to_spend: number;
  upcoming_bills_14d: number;
  inflow_30d: number;
  outflow_30d: number;
  buckets: BucketSummary[];
  checking_accounts: CheckingAccountDetail[];
  burn_rate?: BurnRateMetric | null;
  cashflow_trend: DailyCashflowPoint[];
}

export interface Transaction {
  id: string;
  account_id: string;
  posted_at: string;
  transacted_at?: string | null;
  amount: number;
  merchant_raw: string;
  merchant_clean?: string | null;
  category: string;
  is_pending: boolean;
  is_internal_transfer: boolean;
  is_recurring: boolean;
  roast_score: number;
  roast_sent: boolean;
  roast_message?: string | null;
  user_justification?: string | null;
  created_at?: string;
}

export interface RecurringSchedule {
  id: number;
  merchant_pattern: string;
  expected_amount: number;
  tolerance_pct?: number;
  frequency: string;
  expected_day_of_month?: number | null;
  last_charged_at?: string | null;
  next_expected_at?: string | null;
  active: boolean;
}

export interface PrivacyStatus {
  guest_privacy_mode: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://10.10.10.4:8001";

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`API error [${res.status}] ${endpoint}: ${errorText}`);
  }

  return res.json();
}

export async function getMetrics(): Promise<MetricsSummary> {
  return fetchJson<MetricsSummary>("/api/metrics/summary");
}

export async function updateAccount(
  accountId: string,
  data: {
    bucket?: BucketType;
    custom_name?: string | null;
    account_role?: string | null;
    low_balance_threshold?: number | null;
    statement_due_day?: number | null;
    include_in_cashflow?: boolean | null;
  }
): Promise<Account> {
  return fetchJson<Account>(`/api/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getCalendarBills(): Promise<BillCalendarItem[]> {
  return fetchJson<BillCalendarItem[]>("/api/calendar/bills");
}

export interface GetTransactionsParams {
  bucket?: BucketType;
  account_id?: string;
  is_recurring?: boolean;
  roast_sent?: boolean;
  limit?: number;
  offset?: number;
}

export async function getTransactions(params?: GetTransactionsParams): Promise<Transaction[]> {
  const searchParams = new URLSearchParams();
  if (params?.bucket) searchParams.set("bucket", params.bucket);
  if (params?.account_id) searchParams.set("account_id", params.account_id);
  if (params?.is_recurring !== undefined) searchParams.set("is_recurring", String(params.is_recurring));
  if (params?.roast_sent !== undefined) searchParams.set("roast_sent", String(params.roast_sent));
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  return fetchJson<Transaction[]>(`/api/transactions${query ? `?${query}` : ""}`);
}

export async function getRecurring(): Promise<RecurringSchedule[]> {
  return fetchJson<RecurringSchedule[]>("/api/recurring");
}

export async function triggerSync(): Promise<{ status: string; message: string }> {
  return fetchJson<{ status: string; message: string }>("/api/sync/trigger", {
    method: "POST",
  });
}

export async function getPrivacy(): Promise<PrivacyStatus> {
  return fetchJson<PrivacyStatus>("/api/settings/privacy");
}

export async function togglePrivacy(enabled: boolean): Promise<PrivacyStatus> {
  return fetchJson<PrivacyStatus>("/api/settings/privacy", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}
