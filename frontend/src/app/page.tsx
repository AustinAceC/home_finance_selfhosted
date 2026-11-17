"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getMetrics,
  getTransactions,
  getCalendarBills,
  updateAccount,
  triggerSync,
  triggerTestRoast,
  purgeTestTransactions,
  roastRealPurchases,
  MetricsSummary,
  Transaction,
  BillCalendarItem,
  Account,
  BucketType,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  RefreshCw,
  Tv,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  AlertCircle,
  Flame,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Settings2,
  X,
  Sparkles,
  Trash2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [roasts, setRoasts] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<BillCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");

  // Account editing modal state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editBucket, setEditBucket] = useState<BucketType>("day_to_day");
  const [editRole, setEditRole] = useState<string>("general");
  const [editCustomName, setEditCustomName] = useState<string>("");
  const [editThreshold, setEditThreshold] = useState<number>(500);
  const [editIncludeCashflow, setEditIncludeCashflow] = useState<boolean>(true);
  const [isSavingAccount, setIsSavingAccount] = useState<boolean>(false);
  const [testingRoast, setTestingRoast] = useState<boolean>(false);

  const handleTestRoast = async () => {
    setTestingRoast(true);
    try {
      const res = await triggerTestRoast({
        merchant: "OnlyFans.com",
        amount: 89.99,
        card_name: "Discover (3263)",
        send_telegram: true,
      });
      setSyncFeedback(`Test roast sent to Telegram: "${res.roast.slice(0, 80)}..."`);
      await loadData();
    } catch (err: any) {
      alert("Failed to trigger test roast: " + err.message);
    } finally {
      setTestingRoast(false);
    }
  };

  const handlePurgeTests = async () => {
    try {
      const res = await purgeTestTransactions();
      setSyncFeedback(`Purged ${res.deleted_count} test items.`);
      await loadData();
    } catch (err: any) {
      alert("Failed to purge test messages: " + err.message);
    }
  };

  const handleRoastReal = async () => {
    setTestingRoast(true);
    try {
      await purgeTestTransactions();
      const res = await roastRealPurchases(true);
      if (res.roasted_count > 0) {
        setSyncFeedback(`Marcus evaluated ${res.roasted_count} transactions and dispatched the top highlight.`);
      } else {
        setSyncFeedback("No un-reviewed candidate transactions found.");
      }
      await loadData();
    } catch (err: any) {
      alert("Failed to roast real purchases: " + err.message);
    } finally {
      setTestingRoast(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [metricsData, roastsData, billsData] = await Promise.all([
        getMetrics().catch((err) => {
          console.warn("Metrics fetch error:", err);
          return null;
        }),
        getTransactions({ roast_sent: true, limit: 6 }).catch((err) => {
          console.warn("Roasts fetch error:", err);
          return [];
        }),
        getCalendarBills().catch((err) => {
          console.warn("Bills fetch error:", err);
          return [];
        }),
      ]);

      if (metricsData) {
        setMetrics(metricsData);
      }
      setRoasts(roastsData || []);
      setBills(billsData || []);
    } catch (e) {
      console.error("Dashboard data load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(interval);
    };
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await triggerSync();
      setSyncFeedback(res.message || "Financial sync triggered");
      setTimeout(() => {
        loadData();
      }, 3500);
    } catch (err: any) {
      setSyncFeedback(err.message || "Failed to trigger sync");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncFeedback(null), 6000);
    }
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setEditBucket(account.bucket);
    setEditRole(account.account_role || "general");
    setEditCustomName(account.custom_name || account.name);
    setEditThreshold(account.low_balance_threshold ?? 500);
    setEditIncludeCashflow(account.include_in_cashflow);
  };

  const handleSaveAccount = async () => {
    if (!editingAccount) return;
    setIsSavingAccount(true);
    try {
      await updateAccount(editingAccount.id, {
        bucket: editBucket,
        account_role: editRole,
        custom_name: editCustomName.trim() || null,
        low_balance_threshold: editThreshold,
        include_in_cashflow: editIncludeCashflow,
      });
      setEditingAccount(null);
      await loadData();
    } catch (err: any) {
      alert("Failed to update account: " + err.message);
    } finally {
      setIsSavingAccount(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="h-6 w-6 text-emerald-400 animate-spin" />
        <p className="text-zinc-400 text-sm font-medium tracking-wide">Loading workspace...</p>
      </div>
    );
  }

  const safeToSpend = metrics?.true_safe_to_spend ?? 0;
  const burnRate = metrics?.burn_rate;
  const burnTrend = metrics?.daily_burn_trend || [];
  const avg14dSpend =
    burnTrend.length > 0
      ? burnTrend.reduce((sum, p) => sum + p.actual_spend, 0) / burnTrend.length
      : 0;
  const overLimitDays = burnTrend.filter((p) => p.is_over_limit).length;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header */}
      <header className="border-b border-white/[0.08] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-white">Finance Command</span>
              <span className="hidden sm:inline-block text-xs text-zinc-400 ml-2 font-normal">
                Cashflow Radar & AI Guidance
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center text-xs text-zinc-400 bg-white/[0.03] px-3 py-1.5 rounded-lg border border-white/[0.06] space-x-2">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>{currentTime}</span>
            </div>

            <Link
              href="/tv-kiosk"
              target="_blank"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all"
            >
              <Tv className="w-3.5 h-3.5 text-zinc-400" />
              <span>Shield TV</span>
            </Link>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Syncing..." : "Sync"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {syncFeedback && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-xl text-xs font-medium flex items-center space-x-2.5 transition-all">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Hero Section: True Safe-to-Spend & Burn Velocity */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Safe-to-Spend Primary Card */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/[0.03] rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center space-x-2 text-xs font-medium text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-subtle-pulse" />
                <span>Liquid Spendable Cashflow</span>
              </div>
              <div className="mt-3 flex items-baseline space-x-3">
                <h1
                  className={`text-4xl sm:text-6xl font-semibold tracking-tight font-mono ${
                    safeToSpend >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatCurrency(safeToSpend)}
                </h1>
              </div>
              <p className="text-sm text-zinc-400 mt-2 max-w-lg leading-relaxed">
                Liquid checking cash remaining after settling all credit card balances to zero and reserving for scheduled obligations over the next 14 days.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-white/[0.06]">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-xs text-zinc-400 block font-medium">Card Float</span>
                <span className="text-sm font-semibold font-mono text-rose-400 mt-0.5 block">
                  {formatCurrency(metrics?.short_term_debt_balance ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-xs text-zinc-400 block font-medium">14-Day Bills</span>
                <span className="text-sm font-semibold font-mono text-amber-300 mt-0.5 block">
                  {formatCurrency(metrics?.upcoming_bills_14d ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-xs text-zinc-400 block font-medium">30-Day Inflow</span>
                <span className="text-sm font-semibold font-mono text-emerald-400 mt-0.5 block">
                  +{formatCurrency(metrics?.inflow_30d ?? 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-xs text-zinc-400 block font-medium">30-Day Outflow</span>
                <span className="text-sm font-semibold font-mono text-zinc-300 mt-0.5 block">
                  -{formatCurrency(metrics?.outflow_30d ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Burn Velocity Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Monthly Outflow Pace
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    burnRate?.status === "critical"
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      : burnRate?.status === "warning"
                      ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {burnRate?.status ?? "Normal"}
                </span>
              </div>

              <div className="mt-4 flex items-baseline space-x-2">
                <span className="text-3xl font-semibold font-mono text-white">
                  {burnRate?.burn_rate_pct ?? 0}%
                </span>
                <span className="text-xs text-zinc-400">of 30-day income consumed</span>
              </div>

              {/* Minimalist Progress Meter */}
              <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden mt-4">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (burnRate?.burn_rate_pct ?? 0) > 100
                      ? "bg-rose-500"
                      : (burnRate?.burn_rate_pct ?? 0) > 80
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                  style={{ width: `${Math.min(burnRate?.burn_rate_pct ?? 0, 100)}%` }}
                />
              </div>

              <p className="text-xs text-zinc-400 mt-4 leading-relaxed">
                {burnRate?.status_message || "Monitoring current burn against scheduled income and standard baseline."}
              </p>
            </div>

            <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs">
              <span className="text-zinc-400">Safe Daily Limit:</span>
              <span className="font-semibold font-mono text-emerald-400">
                {formatCurrency(burnRate?.safe_daily_spend ?? 0)} / day
              </span>
            </div>
          </div>
        </section>

        {/* Dedicated Checking Accounts Cashflow Radar */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Checking Accounts & Allocation</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Segregated balances for daily spending, recurring commitments, and payroll
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(metrics?.checking_accounts || []).map((acct) => {
              const isPrimary = acct.account_role === "primary_spend";
              const isMortgage = acct.account_role === "mortgage";
              const isBills = acct.account_role === "bills_subs";

              let roleLabel = "General Checking";
              if (isPrimary) roleLabel = "Primary Spend & Card Payoff";
              else if (isMortgage) roleLabel = "Mortgage & Payroll Deposits";
              else if (isBills) roleLabel = "Utilities & Subscriptions";

              return (
                <div
                  key={acct.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] p-5 flex flex-col justify-between transition-all group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-300">
                        {roleLabel}
                      </span>
                      <button
                        onClick={() => {
                          const raw = metrics?.buckets
                            ?.flatMap((b) => b.accounts)
                            .find((a) => a.id === acct.id);
                          if (raw) openEditModal(raw);
                        }}
                        className="text-zinc-400 hover:text-white transition-colors p-1"
                        title="Configure Account"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="font-medium text-white text-sm truncate">
                      {acct.custom_name || acct.name}
                    </h3>
                    <p className="text-xs text-zinc-400 mb-3">{acct.institution}</p>

                    <div className="text-2xl font-semibold font-mono text-white mb-4">
                      {formatCurrency(acct.current_balance)}
                    </div>

                    {/* Cashflow In/Out stats */}
                    <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/[0.04] p-2.5 rounded-xl text-xs font-mono mb-3">
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-sans">Inflow</span>
                        <span className="text-emerald-400 font-medium">+{formatCurrency(acct.inflow_30d)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-sans">Outflow</span>
                        <span className="text-zinc-300 font-medium">-{formatCurrency(acct.outflow_30d)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block font-sans">Net</span>
                        <span
                          className={`font-medium ${
                            acct.net_cashflow >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatCurrency(acct.net_cashflow)}
                        </span>
                      </div>
                    </div>

                    {acct.warnings.length > 0 && (
                      <div className="space-y-1.5 my-3">
                        {acct.warnings.map((w, idx) => (
                          <div
                            key={idx}
                            className="text-xs flex items-center space-x-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-1.5 rounded-lg"
                          >
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                    <span>Threshold Floor:</span>
                    <span className="font-mono text-zinc-300">
                      {formatCurrency(acct.low_balance_threshold)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4 Financial Buckets */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">4 Core Asset Buckets</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Categorized institutional accounts and balances
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(metrics?.buckets || []).map((b) => {
              let label = "Day-to-Day Checking";
              let balanceColor = "text-emerald-400";
              let icon = <Wallet className="w-4 h-4 text-emerald-400" />;

              if (b.bucket === "short_term_debt") {
                label = "Short-Term Debt";
                balanceColor = "text-rose-400";
                icon = <CreditCard className="w-4 h-4 text-rose-400" />;
              } else if (b.bucket === "savings") {
                label = "Savings & Reserves";
                balanceColor = "text-blue-400";
                icon = <PiggyBank className="w-4 h-4 text-blue-400" />;
              } else if (b.bucket === "retirement") {
                label = "Retirement & Wealth";
                balanceColor = "text-purple-400";
                icon = <TrendingUp className="w-4 h-4 text-purple-400" />;
              }

              return (
                <div
                  key={b.bucket}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 text-xs font-medium text-zinc-300">
                        {icon}
                        <span>{label}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400">{b.account_count} accts</span>
                    </div>

                    <div className={`text-2xl font-semibold font-mono my-2 ${balanceColor}`}>
                      {formatCurrency(b.total_balance)}
                    </div>

                    <div className="space-y-2 mt-4 max-h-56 overflow-y-auto pr-1">
                      {b.accounts.map((acct) => (
                        <div
                          key={acct.id}
                          className="bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.1] rounded-xl p-2.5 text-xs flex items-center justify-between transition-colors group"
                        >
                          <div className="truncate pr-2">
                            <span className="font-medium text-zinc-200 block truncate">
                              {acct.custom_name || acct.name}
                            </span>
                            <span className="text-[11px] text-zinc-400 block mt-0.5">
                              {acct.institution}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-zinc-300 font-medium whitespace-nowrap">
                              {formatCurrency(acct.current_balance)}
                            </span>
                            <button
                              onClick={() => openEditModal(acct)}
                              className="text-zinc-400 hover:text-white transition-colors p-1"
                              title="Edit Account"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {b.accounts.length === 0 && (
                        <p className="text-xs text-zinc-400 italic py-2">No active accounts in bucket</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Charts: Velocity & Cashflow */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Burn Rate vs Safe Limit */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.06] gap-2 mb-4">
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Daily Burn vs. Speed Limit</h3>
                </div>
                <div className="flex items-center space-x-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Within Pace
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    Over Cap
                  </span>
                </div>
              </div>

              {/* Stat Summary */}
              <div className="grid grid-cols-3 gap-2 mb-4 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl text-xs">
                <div>
                  <span className="text-zinc-400 block">Safe Target</span>
                  <span className="text-amber-300 font-semibold font-mono mt-0.5 block">
                    {formatCurrency(burnRate?.safe_daily_spend ?? 0)}/d
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">14d Average</span>
                  <span className="text-zinc-200 font-semibold font-mono mt-0.5 block">
                    {formatCurrency(avg14dSpend)}/d
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">Spikes</span>
                  <span className={`font-semibold font-mono mt-0.5 block ${overLimitDays > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {overLimitDays} of {burnTrend.length} days
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={burnTrend} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#18181b]/95 backdrop-blur-md border border-white/[0.1] p-3 rounded-xl text-xs shadow-2xl space-y-1.5">
                            <p className="text-zinc-400 font-medium">{d.date}</p>
                            <div className="flex justify-between gap-4">
                              <span className="text-zinc-400">Actual Outflow:</span>
                              <span className={`font-mono font-medium ${d.is_over_limit ? "text-rose-400" : "text-emerald-400"}`}>
                                {formatCurrency(d.actual_spend)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-zinc-400">Safe Target:</span>
                              <span className="font-mono text-amber-300 font-medium">{formatCurrency(d.safe_limit)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {burnRate?.safe_daily_spend && burnRate.safe_daily_spend > 0 && (
                      <ReferenceLine
                        y={burnRate.safe_daily_spend}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                      />
                    )}
                    <Bar dataKey="actual_spend" name="Spend" radius={[4, 4, 0, 0]}>
                      {burnTrend.map((entry, idx) => (
                        <Cell
                          key={`burn-${idx}`}
                          fill={entry.is_over_limit ? "#f87171" : "#34d399"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 14-Day Cashflow In vs Out */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">14-Day Cashflow Dynamics</h3>
                </div>
                <span className="text-xs text-zinc-400">Inflows vs. Outflows</span>
              </div>

              {/* Cashflow Stat Highlights */}
              <div className="grid grid-cols-3 gap-2 mb-4 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl text-xs">
                <div>
                  <span className="text-zinc-400 block">Total Inflow</span>
                  <span className="text-emerald-400 font-semibold font-mono mt-0.5 block">
                    +{formatCurrency((metrics?.cashflow_trend || []).reduce((s, c) => s + c.inflow, 0))}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">Total Outflow</span>
                  <span className="text-zinc-300 font-semibold font-mono mt-0.5 block">
                    -{formatCurrency((metrics?.cashflow_trend || []).reduce((s, c) => s + c.outflow, 0))}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">Net Change</span>
                  {(() => {
                    const net14 = (metrics?.cashflow_trend || []).reduce((s, c) => s + c.net, 0);
                    return (
                      <span className={`font-semibold font-mono mt-0.5 block ${net14 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatCurrency(net14)}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics?.cashflow_trend || []} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        borderColor: "rgba(255,255,255,0.1)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                      formatter={(val: any) => formatCurrency(Number(val))}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                    <Bar dataKey="inflow" name="Inflow" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Outflow" fill="#71717a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Bills Calendar */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-white">Upcoming Obligations</h2>
            </div>
            <span className="text-xs text-zinc-400">
              {bills.length} active schedules (45-day window)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bills.map((bill) => {
              const isDueSoon = bill.days_until <= 3;
              return (
                <div
                  key={bill.id}
                  className={`p-4 rounded-xl border text-xs flex items-center justify-between transition-all ${
                    isDueSoon
                      ? "bg-amber-500/[0.04] border-amber-500/30 text-amber-200"
                      : "bg-white/[0.02] border-white/[0.06] text-zinc-300 hover:border-white/[0.1]"
                  }`}
                >
                  <div className="truncate pr-3">
                    <span className="font-medium block text-white text-sm truncate">{bill.title}</span>
                    <span className="text-xs text-zinc-400 mt-0.5 block">
                      Due {bill.due_date} · {bill.frequency}
                    </span>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="font-mono font-medium text-sm block text-white">
                      {formatCurrency(bill.expected_amount)}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${
                        bill.days_until === 0
                          ? "bg-rose-500/20 text-rose-300"
                          : bill.days_until === 1
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-white/[0.06] text-zinc-400"
                      }`}
                    >
                      {bill.days_until === 0
                        ? "Today"
                        : bill.days_until === 1
                        ? "Tomorrow"
                        : `in ${bill.days_until} days`}
                    </span>
                  </div>
                </div>
              );
            })}
            {bills.length === 0 && (
              <p className="col-span-full text-xs text-zinc-400 italic py-6 text-center">
                No upcoming bills found within the next 45 days.
              </p>
            )}
          </div>
        </section>

        {/* AI Financial Planner (Marcus) Feed */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div>
                <h2 className="text-base font-semibold text-white">Marcus — Financial Advisor</h2>
                <p className="text-xs text-zinc-400">Direct evaluations & recent accountability reviews</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePurgeTests}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 hover:text-white border border-white/[0.08] text-xs transition-all"
                title="Remove test simulated transactions"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Purge Tests</span>
              </button>
              <button
                onClick={handleRoastReal}
                disabled={testingRoast}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-all disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${testingRoast ? "animate-spin" : ""}`} />
                <span>{testingRoast ? "Evaluating..." : "Review Recent Purchases"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roasts.map((r) => (
              <div
                key={r.id}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span className="font-medium text-zinc-200 truncate pr-2">
                      {r.merchant_clean || r.merchant_raw}
                    </span>
                    <span className="font-mono text-zinc-300 font-medium">
                      -{formatCurrency(Math.abs(r.amount))}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed bg-white/[0.02] p-3 rounded-lg border border-white/[0.04] italic">
                    &ldquo;{r.roast_message || "Purchase under review."}&rdquo;
                  </p>
                </div>

                {r.user_justification ? (
                  <div className="text-[11px] text-zinc-400 border-t border-white/[0.04] pt-2 flex items-center justify-between">
                    <span>Justification:</span>
                    <span className="text-emerald-400 font-medium">{r.category}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 border-t border-white/[0.04] pt-2 flex items-center space-x-1.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Awaiting justification via Telegram</span>
                  </div>
                )}
              </div>
            ))}
            {roasts.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-zinc-400">
                No recent evaluations pending. Discretionary expenses will appear here.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Account Configuration Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#18181b] border border-white/[0.1] w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center space-x-2">
                  <Settings2 className="w-4 h-4 text-emerald-400" />
                  <span>Configure Account</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {editingAccount.institution} · {editingAccount.name}
                </p>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-300 font-medium block mb-1.5">Custom Label</label>
                <input
                  type="text"
                  value={editCustomName}
                  onChange={(e) => setEditCustomName(e.target.value)}
                  placeholder="e.g. Primary Daily Spend, Mortgage Escrow"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-medium block mb-1.5">Asset Bucket</label>
                <select
                  value={editBucket}
                  onChange={(e) => setEditBucket(e.target.value as BucketType)}
                  className="w-full bg-[#27272a] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="day_to_day">Day-to-Day Checking</option>
                  <option value="short_term_debt">Short-Term Debt (Credit Cards)</option>
                  <option value="savings">Savings / Reserves / General Brokerage</option>
                  <option value="retirement">Retirement (401k / IRA / Off-Budget)</option>
                </select>
              </div>

              {editBucket === "day_to_day" && (
                <div>
                  <label className="text-zinc-300 font-medium block mb-1.5">Checking Function</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full bg-[#27272a] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="primary_spend">Primary Spend & Credit Card Payoff</option>
                    <option value="mortgage">Mortgage & Payroll Direct Deposits</option>
                    <option value="bills_subs">Utilities & Recurring Subscriptions</option>
                    <option value="general">General Checking Account</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-zinc-300 font-medium block mb-1.5">Low Balance Warning Floor ($)</label>
                <input
                  type="number"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(Number(e.target.value))}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="includeCashflow"
                  checked={editIncludeCashflow}
                  onChange={(e) => setEditIncludeCashflow(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-0"
                />
                <label htmlFor="includeCashflow" className="text-zinc-300 cursor-pointer text-xs">
                  Include balance in active cashflow calculation
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-white/[0.08]">
              <button
                onClick={() => setEditingAccount(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccount}
                disabled={isSavingAccount}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-all disabled:opacity-50"
              >
                {isSavingAccount ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
