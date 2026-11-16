"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getMetrics,
  getTransactions,
  getRecurring,
  getCalendarBills,
  updateAccount,
  triggerSync,
  MetricsSummary,
  Transaction,
  RecurringSchedule,
  BillCalendarItem,
  CheckingAccountDetail,
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
  AlertTriangle,
  Flame,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Settings2,
  Check,
  X,
  Gauge,
  Home,
  Receipt,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
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
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Account editing modal state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editBucket, setEditBucket] = useState<BucketType>("day_to_day");
  const [editRole, setEditRole] = useState<string>("general");
  const [editCustomName, setEditCustomName] = useState<string>("");
  const [editThreshold, setEditThreshold] = useState<number>(500);
  const [editIncludeCashflow, setEditIncludeCashflow] = useState<boolean>(true);
  const [isSavingAccount, setIsSavingAccount] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const [metricsData, roastsData, billsData] = await Promise.all([
        getMetrics().catch((err) => {
          console.warn("Metrics fetch error:", err);
          return null;
        }),
        getTransactions({ roast_sent: true, limit: 5 }).catch((err) => {
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
      setLastRefreshed(new Date());
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
          second: "2-digit",
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
      setSyncFeedback(res.message || "Sync queued!");
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 text-[#00ff88] animate-spin" />
        <p className="text-zinc-400 font-mono text-sm">Loading Financial Command Center...</p>
      </div>
    );
  }

  const safeToSpend = metrics?.true_safe_to_spend ?? 0;
  const burnRate = metrics?.burn_rate;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#00ff88]/30 font-sans p-4 md:p-8 space-y-8">
      {/* Top Header Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="text-[#00ff88]">💸</span> FINANCE HQ
            </span>
            <span className="bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-xs px-2.5 py-0.5 rounded-full font-mono">
              Self-Hosted Coolify
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            4-Bucket Core · Cashflow Radar · Live AI Parole Officer
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <div className="text-xs text-zinc-400 font-mono bg-zinc-900/80 px-3 py-1.5 rounded-md border border-zinc-800 flex items-center space-x-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{currentTime || "Live"}</span>
          </div>

          <Link
            href="/tv-kiosk"
            target="_blank"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-[#4488ff] border border-[#4488ff]/40 hover:border-[#4488ff] transition-colors"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Shield TV Kiosk</span>
          </Link>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-[#00ff88] hover:bg-[#00e077] text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,255,136,0.3)] hover:shadow-[0_0_20px_rgba(0,255,136,0.5)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </header>

      {syncFeedback && (
        <div className="bg-[#00ff88]/10 border border-[#00ff88]/40 text-[#00ff88] px-4 py-2.5 rounded-lg text-xs font-mono flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Hero Section: Safe-to-Spend & Burn Rate Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Safe-to-Spend Hero */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 via-black to-zinc-950 p-6 md:p-8">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
                <span>True Safe-to-Spend</span>
              </div>
              <div
                className={`text-4xl sm:text-6xl font-black font-mono tracking-tight my-2 ${
                  safeToSpend >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"
                }`}
              >
                {formatCurrency(safeToSpend)}
              </div>
              <p className="text-xs text-zinc-400 max-w-md">
                Remaining liquid checking cash after paying off every credit card to $0.00 and
                covering all scheduled bills due in the next 14 days.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-zinc-800/80">
              <div className="bg-black/60 border border-zinc-800 p-3 rounded-lg">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">Card Float</span>
                <span className="text-base font-bold font-mono text-[#ff4444]">
                  {formatCurrency(metrics?.short_term_debt_balance ?? 0)}
                </span>
              </div>
              <div className="bg-black/60 border border-zinc-800 p-3 rounded-lg">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">14d Bills Due</span>
                <span className="text-base font-bold font-mono text-[#ffcc00]">
                  {formatCurrency(metrics?.upcoming_bills_14d ?? 0)}
                </span>
              </div>
              <div className="bg-black/60 border border-zinc-800 p-3 rounded-lg">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">30d Inflow</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  +{formatCurrency(metrics?.inflow_30d ?? 0)}
                </span>
              </div>
              <div className="bg-black/60 border border-zinc-800 p-3 rounded-lg">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">30d Outflow</span>
                <span className="text-base font-bold font-mono text-rose-400">
                  -{formatCurrency(metrics?.outflow_30d ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Burn Rate Velocity Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Burn Rate Velocity</span>
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  burnRate?.status === "critical"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : burnRate?.status === "warning"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {burnRate?.status ?? "Normal"}
              </span>
            </div>

            <div className="flex items-baseline space-x-2 my-2">
              <span className="text-4xl font-extrabold font-mono text-white">
                {burnRate?.burn_rate_pct ?? 0}%
              </span>
              <span className="text-xs text-zinc-400 font-mono">of 30-day income</span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden my-3">
              <div
                className={`h-full transition-all duration-500 ${
                  (burnRate?.burn_rate_pct ?? 0) > 100
                    ? "bg-rose-500"
                    : (burnRate?.burn_rate_pct ?? 0) > 80
                    ? "bg-amber-400"
                    : "bg-[#00ff88]"
                }`}
                style={{ width: `${Math.min(burnRate?.burn_rate_pct ?? 0, 100)}%` }}
              />
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {burnRate?.status_message || "Monitoring daily spending pace against monthly cash inflow."}
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">Safe Daily Pace:</span>
            <span className="font-bold text-[#00ff88]">
              {formatCurrency(burnRate?.safe_daily_spend ?? 0)} / day
            </span>
          </div>
        </div>
      </div>

      {/* 3 Dedicated Checking Accounts Cashflow Radar */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-[#00ff88]" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              Checking Accounts & Dedicated Cashflow Radar
            </h2>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            Direct Deposits · Mortgage Escrow · Utilities & Subs
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(metrics?.checking_accounts || []).map((acct) => {
            const isPrimary = acct.account_role === "primary_spend";
            const isMortgage = acct.account_role === "mortgage";
            const isBills = acct.account_role === "bills_subs";

            let roleLabel = "General Checking";
            let roleColor = "border-zinc-800";
            if (isPrimary) {
              roleLabel = "💳 Primary Spend & CC Payoff";
              roleColor = "border-[#00ff88]/40";
            } else if (isMortgage) {
              roleLabel = "🏡 Mortgage & Work Deposits";
              roleColor = "border-[#4488ff]/40";
            } else if (isBills) {
              roleLabel = "📑 Utilities & Subscriptions";
              roleColor = "border-amber-500/40";
            }

            return (
              <div
                key={acct.id}
                className={`bg-zinc-950 border ${roleColor} rounded-xl p-5 flex flex-col justify-between relative group hover:border-zinc-700 transition-all`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium">
                      {roleLabel}
                    </span>
                    <button
                      onClick={() => {
                        const raw = metrics?.buckets
                          ?.flatMap((b) => b.accounts)
                          .find((a) => a.id === acct.id);
                        if (raw) openEditModal(raw);
                      }}
                      className="text-zinc-500 hover:text-white transition-colors"
                      title="Configure Account"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>

                  <h3 className="font-semibold text-white text-base truncate">
                    {acct.custom_name || acct.name}
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono mb-3">{acct.institution}</p>

                  <div className="text-3xl font-black font-mono text-white mb-4">
                    {formatCurrency(acct.current_balance)}
                  </div>

                  {/* Cashflow In/Out 30d */}
                  <div className="grid grid-cols-3 gap-2 bg-black/50 border border-zinc-900 p-2.5 rounded-lg text-xs font-mono mb-3">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">30d In</span>
                      <span className="text-emerald-400 font-bold">+{formatCurrency(acct.inflow_30d)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">30d Out</span>
                      <span className="text-rose-400 font-bold">-{formatCurrency(acct.outflow_30d)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Net</span>
                      <span
                        className={`font-bold ${
                          acct.net_cashflow >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatCurrency(acct.net_cashflow)}
                      </span>
                    </div>
                  </div>

                  {/* Warnings & Alerts */}
                  {acct.warnings.length > 0 && (
                    <div className="space-y-1.5 my-3">
                      {acct.warnings.map((w, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] font-mono flex items-center space-x-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-1 rounded"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>Threshold Buffer:</span>
                  <span className="text-zinc-300 font-bold">
                    {formatCurrency(acct.low_balance_threshold)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 Primary Core Buckets Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-white">4 Strict Financial Buckets</h2>
          <span className="text-xs text-zinc-400 font-mono">
            Click ⚙️ on any account to reclassify or customize
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(metrics?.buckets || []).map((b) => {
            let label = "Day-to-Day Checking";
            let color = "text-[#00ff88]";
            let border = "border-zinc-800";
            let icon = <Wallet className="w-4 h-4 text-[#00ff88]" />;

            if (b.bucket === "short_term_debt") {
              label = "Short-Term Debt";
              color = "text-[#ff4444]";
              icon = <CreditCard className="w-4 h-4 text-[#ff4444]" />;
            } else if (b.bucket === "savings") {
              label = "Savings / Reserves";
              color = "text-[#4488ff]";
              icon = <PiggyBank className="w-4 h-4 text-[#4488ff]" />;
            } else if (b.bucket === "retirement") {
              label = "Retirement & Investments";
              color = "text-purple-400";
              icon = <TrendingUp className="w-4 h-4 text-purple-400" />;
            }

            return (
              <div
                key={b.bucket}
                className={`bg-zinc-950 border ${border} rounded-xl p-5 flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-zinc-400 flex items-center space-x-1.5">
                      {icon}
                      <span>{label}</span>
                    </span>
                    <span className="text-xs font-mono text-zinc-500">{b.account_count} accts</span>
                  </div>

                  <div className={`text-2xl font-black font-mono my-2 ${color}`}>
                    {formatCurrency(b.total_balance)}
                  </div>

                  <div className="space-y-2 mt-4 max-h-56 overflow-y-auto pr-1">
                    {b.accounts.map((acct) => (
                      <div
                        key={acct.id}
                        className="bg-black/40 border border-zinc-900 rounded p-2 text-xs flex items-center justify-between group hover:border-zinc-700 transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-medium text-zinc-200 block truncate">
                            {acct.custom_name || acct.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono block">
                            {acct.institution}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-zinc-300 font-bold whitespace-nowrap">
                            {formatCurrency(acct.current_balance)}
                          </span>
                          <button
                            onClick={() => openEditModal(acct)}
                            className="text-zinc-600 hover:text-white transition-colors p-1"
                            title="Edit Account / Reassign Bucket"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {b.accounts.length === 0 && (
                      <p className="text-xs text-zinc-600 italic">No accounts in this bucket</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 14-Day Cashflow History Chart & Upcoming Bills Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cashflow Trend Graph */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#00ff88]" />
              <span>14-Day Cashflow History</span>
            </h3>
            <span className="text-xs font-mono text-zinc-500">Daily Inflows vs Outflows</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics?.cashflow_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" stroke="#666" fontSize={10} tickLine={false} />
                <YAxis stroke="#666" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#000", borderColor: "#333", fontSize: "12px", fontFamily: "monospace" }}
                  formatter={(val: any) => formatCurrency(Number(val))}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Bar dataKey="inflow" name="Inflow (+)" fill="#00ff88" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow (-)" fill="#ff4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Bills Calendar */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <CalendarIcon className="w-4 h-4 text-amber-400" />
                <span>Upcoming Bills & Pay Dates</span>
              </h3>
              <span className="text-xs font-mono text-zinc-500">45-Day Timeline</span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {bills.map((bill) => {
                const isDueSoon = bill.days_until <= 3;
                return (
                  <div
                    key={bill.id}
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      isDueSoon
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                        : "bg-black/50 border-zinc-800/80 text-zinc-300"
                    }`}
                  >
                    <div>
                      <span className="font-bold block text-white text-sm">{bill.title}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        Due {bill.due_date} ({bill.frequency})
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-sm block">
                        {formatCurrency(bill.expected_amount)}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                          isDueSoon ? "bg-amber-500/30 text-amber-300" : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {bill.days_until === 0
                          ? "DUE TODAY"
                          : bill.days_until === 1
                          ? "TOMORROW"
                          : `in ${bill.days_until} days`}
                      </span>
                    </div>
                  </div>
                );
              })}
              {bills.length === 0 && (
                <p className="text-xs text-zinc-500 italic py-6 text-center">
                  No upcoming bills detected yet. As recurring charges clear, SimpleFIN will populate them.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Wall of Shame: Recent AI Roasts */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              AI Roast Bot — Recent Disciplinary Actions
            </h2>
          </div>
          <span className="text-xs font-mono text-zinc-500">Two-Way Telegram Loop</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roasts.map((r) => (
            <div
              key={r.id}
              className="bg-black/70 border border-zinc-800/80 rounded-lg p-4 space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1">
                  <span className="truncate pr-2">{r.merchant_clean || r.merchant_raw}</span>
                  <span className="text-rose-400 font-bold whitespace-nowrap">
                    -{formatCurrency(Math.abs(r.amount))}
                  </span>
                </div>

                <p className="text-xs italic text-[#ffcc00] font-mono leading-relaxed bg-zinc-900/60 p-2.5 rounded border border-zinc-800">
                  &ldquo;{r.roast_message || "Target identified. Standby for roast."}&rdquo;
                </p>
              </div>

              {r.user_justification ? (
                <div className="text-[11px] text-zinc-400 font-mono border-t border-zinc-800/80 pt-2 flex items-center justify-between">
                  <span>Excused as:</span>
                  <span className="text-emerald-400 font-bold">{r.category}</span>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500 font-mono border-t border-zinc-800/80 pt-2 flex items-center space-x-1.5">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>Awaiting user excuse via Telegram...</span>
                </div>
              )}
            </div>
          ))}
          {roasts.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs font-mono text-zinc-500">
              No recent roasts dispatched. Purchases scoring ≥50 velocity or debt violations will appear here!
            </div>
          )}
        </div>
      </section>

      {/* Account Edit / Reassignment Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-xl p-6 space-y-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Settings2 className="w-5 h-5 text-[#00ff88]" />
                  <span>Configure Account</span>
                </h3>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                  {editingAccount.institution} · {editingAccount.name}
                </p>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Custom Display Name */}
              <div>
                <label className="text-zinc-400 block mb-1">Custom Display Name</label>
                <input
                  type="text"
                  value={editCustomName}
                  onChange={(e) => setEditCustomName(e.target.value)}
                  placeholder="e.g. Primary Daily Spend, Mortgage Escrow"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00ff88]"
                />
              </div>

              {/* Bucket Selection */}
              <div>
                <label className="text-zinc-400 block mb-1">Bucket Classification</label>
                <select
                  value={editBucket}
                  onChange={(e) => setEditBucket(e.target.value as BucketType)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00ff88]"
                >
                  <option value="day_to_day">🟢 Day-to-Day Checking</option>
                  <option value="short_term_debt">🔴 Short-Term Debt (Credit Cards)</option>
                  <option value="savings">🔵 Savings / Reserves / General Brokerage</option>
                  <option value="retirement">🟣 Retirement (401k / IRA / Off-Budget)</option>
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Change this anytime to sort accounts (e.g. general brokerage into Savings).
                </p>
              </div>

              {/* Role Assignment (if Day-to-Day) */}
              {editBucket === "day_to_day" && (
                <div>
                  <label className="text-zinc-400 block mb-1">Checking Account Purpose</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00ff88]"
                  >
                    <option value="primary_spend">💳 Primary Spend & CC Payoff (Active Debit)</option>
                    <option value="mortgage">🏡 Mortgage & Work Direct Deposits</option>
                    <option value="bills_subs">📑 Utilities & Recurring Subscriptions</option>
                    <option value="general">General Checking Account</option>
                  </select>
                </div>
              )}

              {/* Low Balance Warning Threshold */}
              <div>
                <label className="text-zinc-400 block mb-1">
                  Low Balance Alert Threshold ($)
                </label>
                <input
                  type="number"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-[#00ff88]"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Triggers an on-screen dashboard warning if balance drops below this amount.
                </p>
              </div>

              {/* Include in Cashflow */}
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="includeCashflow"
                  checked={editIncludeCashflow}
                  onChange={(e) => setEditIncludeCashflow(e.target.checked)}
                  className="rounded border-zinc-800 bg-zinc-900 text-[#00ff88] focus:ring-0"
                />
                <label htmlFor="includeCashflow" className="text-zinc-300 cursor-pointer">
                  Include balance in live Cashflow & True Safe-to-Spend
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setEditingAccount(null)}
                className="px-4 py-2 rounded text-xs font-mono text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccount}
                disabled={isSavingAccount}
                className="px-5 py-2 rounded text-xs font-mono font-bold bg-[#00ff88] text-black hover:bg-[#00e077] transition-all disabled:opacity-50"
              >
                {isSavingAccount ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
