"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getMetrics,
  getTransactions,
  getRecurring,
  triggerSync,
  MetricsSummary,
  Transaction,
  RecurringSchedule,
  BucketType,
} from "@/lib/api";
import { formatCurrency, formatDate, getDaysUntil } from "@/lib/utils";
import {
  RefreshCw,
  Tv,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  AlertTriangle,
  Flame,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [roasts, setRoasts] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    try {
      const [metricsData, roastsData, recurringData] = await Promise.all([
        getMetrics().catch((err) => {
          console.warn("Metrics fetch error:", err);
          return null;
        }),
        getTransactions({ roast_sent: true, limit: 5 }).catch((err) => {
          console.warn("Roasts fetch error:", err);
          return [];
        }),
        getRecurring().catch((err) => {
          console.warn("Recurring fetch error:", err);
          return [];
        }),
      ]);

      if (metricsData) {
        setMetrics(metricsData);
      }
      setRoasts(roastsData || []);
      setRecurring(recurringData || []);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("Dashboard data load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount effect & clock ticker
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

    // Initial load
    loadData();

    // 5-minute auto-refresh
    const refreshInterval = setInterval(() => {
      loadData();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(refreshInterval);
    };
  }, [loadData]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncFeedback("Syncing with SimpleFIN...");
      await triggerSync();
      setSyncFeedback("Sync queued! Updating data...");
      setTimeout(async () => {
        await loadData();
        setSyncing(false);
        setSyncFeedback("Sync complete!");
        setTimeout(() => setSyncFeedback(null), 3000);
      }, 2500);
    } catch (err: any) {
      console.error("Sync trigger failed:", err);
      setSyncFeedback("Sync failed. Check backend.");
      setSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  // Filter bills due within 14 days
  const now = new Date();
  const upcomingBills14d = recurring.filter((item) => {
    if (!item.next_expected_at) return false;
    const billDate = new Date(item.next_expected_at);
    const diffDays = (billDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 14;
  });

  const getBucketAccounts = (type: BucketType) => {
    if (!metrics?.buckets) return [];
    const b = metrics.buckets.find((item) => item.bucket === type);
    return b?.accounts || [];
  };

  const getBucketTotal = (type: BucketType): number => {
    switch (type) {
      case "day_to_day":
        return metrics?.day_to_day_balance ?? 0;
      case "short_term_debt":
        return -(metrics?.short_term_debt_balance ?? 0);
      case "savings":
        return metrics?.savings_balance ?? 0;
      case "retirement":
        return metrics?.retirement_balance ?? 0;
      default:
        return 0;
    }
  };

  // Cashflow chart data
  const cashFlowData = [
    {
      name: "30D Inflow",
      amount: metrics?.inflow_30d || 0,
      fill: "#00ff88",
    },
    {
      name: "30D Outflow",
      amount: metrics?.outflow_30d || 0,
      fill: "#ff4444",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-zinc-800">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">💸</span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Finance HQ
            </h1>
            <span className="text-xs bg-zinc-900 text-zinc-400 border border-zinc-800 px-2.5 py-1 rounded-full font-mono uppercase">
              Command Center
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{currentTime || "Loading time..."}</span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-500">Auto-refresh: 5m</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {syncFeedback && (
            <span className="text-xs text-yellow-400 font-mono animate-pulse bg-yellow-950/40 px-3 py-1.5 rounded border border-yellow-900/60">
              {syncFeedback}
            </span>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg border border-zinc-700/60 text-sm font-medium transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#00ff88] ${syncing ? "animate-spin" : ""}`}
            />
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>

          <Link
            href="/tv-kiosk"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-800 text-sm font-medium transition shadow-sm"
          >
            <Tv className="w-4 h-4 text-[#4488ff]" />
            <span>Shield TV Kiosk</span>
          </Link>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="mt-8 space-y-8">
        {/* Hero Section: Safe-to-Spend */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800/80 p-6 md:p-8 shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00ff88] animate-pulse" />
                <h2 className="text-xs uppercase tracking-widest font-semibold text-zinc-400">
                  True Safe-to-Spend
                </h2>
              </div>
              <div className="text-5xl md:text-7xl font-black text-[#00ff88] tracking-tight mt-2 font-mono">
                {metrics
                  ? formatCurrency(metrics.true_safe_to_spend)
                  : "$0.00"}
              </div>
              <p className="text-zinc-400 text-sm md:text-base mt-2 font-medium">
                after cards + 14d bills
              </p>
            </div>

            {/* Formula Breakdown Cards */}
            <div className="grid grid-cols-3 gap-3 md:gap-4 text-xs font-mono bg-black/60 p-4 rounded-xl border border-zinc-800/60 max-w-lg w-full">
              <div className="p-2 rounded bg-zinc-900/50">
                <div className="text-zinc-500 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-[#00ff88]" /> Day-to-Day
                </div>
                <div className="text-[#00ff88] font-semibold text-sm mt-1">
                  {metrics
                    ? formatCurrency(metrics.day_to_day_balance)
                    : "$0.00"}
                </div>
              </div>
              <div className="p-2 rounded bg-zinc-900/50">
                <div className="text-zinc-500 flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-[#ff4444]" /> Cards Due
                </div>
                <div className="text-[#ff4444] font-semibold text-sm mt-1">
                  {metrics
                    ? `-${formatCurrency(metrics.short_term_debt_balance)}`
                    : "$0.00"}
                </div>
              </div>
              <div className="p-2 rounded bg-zinc-900/50">
                <div className="text-zinc-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#ffcc00]" /> 14d Bills
                </div>
                <div className="text-[#ffcc00] font-semibold text-sm mt-1">
                  {metrics
                    ? `-${formatCurrency(metrics.upcoming_bills_14d)}`
                    : "$0.00"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Bucket Grid (2x2) */}
        <div>
          <h3 className="text-lg font-bold text-zinc-300 tracking-wide mb-4 flex items-center gap-2">
            <span>The 4 Buckets</span>
            <span className="text-xs font-normal text-zinc-500">
              (Cashflow & Net Worth Foundation)
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Day to Day (Green) */}
            <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg hover:border-[#00ff88]/40 transition">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00ff88]" />
                  <span className="font-semibold text-white tracking-wide">
                    Day-to-Day Checking
                  </span>
                </div>
                <span className="text-xl md:text-2xl font-bold font-mono text-[#00ff88]">
                  {formatCurrency(getBucketTotal("day_to_day"))}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Primary liquidity for living expenses
              </p>
              <div className="mt-4 space-y-2">
                {getBucketAccounts("day_to_day").length === 0 ? (
                  <div className="text-xs text-zinc-600 italic py-2">
                    No accounts linked in Day-to-Day
                  </div>
                ) : (
                  getBucketAccounts("day_to_day").map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-black/40 border border-zinc-900"
                    >
                      <div className="truncate mr-2">
                        <span className="text-zinc-200 font-medium">
                          {acc.custom_name || acc.name}
                        </span>
                        <span className="text-zinc-500 ml-1.5 text-[11px]">
                          ({acc.institution})
                        </span>
                      </div>
                      <span className="font-mono text-zinc-300">
                        {formatCurrency(acc.current_balance)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. Short-Term Debt (Red) */}
            <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg hover:border-[#ff4444]/40 transition">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff4444]" />
                  <span className="font-semibold text-white tracking-wide">
                    Short-Term Debt & Cards
                  </span>
                </div>
                <span className="text-xl md:text-2xl font-bold font-mono text-[#ff4444]">
                  {formatCurrency(getBucketTotal("short_term_debt"))}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Credit card float & balance payoff liabilities
              </p>
              <div className="mt-4 space-y-2">
                {getBucketAccounts("short_term_debt").length === 0 ? (
                  <div className="text-xs text-zinc-600 italic py-2">
                    No active debt or credit cards
                  </div>
                ) : (
                  getBucketAccounts("short_term_debt").map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-black/40 border border-zinc-900"
                    >
                      <div className="truncate mr-2">
                        <span className="text-zinc-200 font-medium">
                          {acc.custom_name || acc.name}
                        </span>
                        <span className="text-zinc-500 ml-1.5 text-[11px]">
                          ({acc.institution})
                        </span>
                      </div>
                      <span className="font-mono text-[#ff4444]">
                        -{formatCurrency(Math.abs(acc.current_balance))}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Savings (Blue) */}
            <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg hover:border-[#4488ff]/40 transition">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4488ff]" />
                  <span className="font-semibold text-white tracking-wide">
                    Emergency & Liquid Savings
                  </span>
                </div>
                <span className="text-xl md:text-2xl font-bold font-mono text-[#4488ff]">
                  {formatCurrency(getBucketTotal("savings"))}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                HYSA, reserve funds & safe emergency cushion
              </p>
              <div className="mt-4 space-y-2">
                {getBucketAccounts("savings").length === 0 ? (
                  <div className="text-xs text-zinc-600 italic py-2">
                    No savings accounts linked
                  </div>
                ) : (
                  getBucketAccounts("savings").map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-black/40 border border-zinc-900"
                    >
                      <div className="truncate mr-2">
                        <span className="text-zinc-200 font-medium">
                          {acc.custom_name || acc.name}
                        </span>
                        <span className="text-zinc-500 ml-1.5 text-[11px]">
                          ({acc.institution})
                        </span>
                      </div>
                      <span className="font-mono text-zinc-300">
                        {formatCurrency(acc.current_balance)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 4. Retirement (Gray / Off-Budget) */}
            <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg hover:border-zinc-700 transition">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-zinc-500" />
                  <span className="font-semibold text-zinc-300 tracking-wide">
                    Retirement & Long-Term
                  </span>
                  <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800">
                    Off-Budget
                  </span>
                </div>
                <span className="text-xl md:text-2xl font-bold font-mono text-zinc-400">
                  {formatCurrency(getBucketTotal("retirement"))}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                401(k), IRA & brokerage portfolios (excluded from safe-to-spend)
              </p>
              <div className="mt-4 space-y-2">
                {getBucketAccounts("retirement").length === 0 ? (
                  <div className="text-xs text-zinc-600 italic py-2">
                    No retirement accounts linked
                  </div>
                ) : (
                  getBucketAccounts("retirement").map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-black/40 border border-zinc-900"
                    >
                      <div className="truncate mr-2">
                        <span className="text-zinc-300 font-medium">
                          {acc.custom_name || acc.name}
                        </span>
                        <span className="text-zinc-500 ml-1.5 text-[11px]">
                          ({acc.institution})
                        </span>
                      </div>
                      <span className="font-mono text-zinc-400">
                        {formatCurrency(acc.current_balance)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 30-Day Cash Flow & Upcoming Bills Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 30-Day Cash Flow Bar */}
          <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-200 tracking-wide flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#00ff88]" />
                  <span>30-Day Cash Flow</span>
                </h3>
                <span className="text-xs text-zinc-500 font-mono">
                  Net:{" "}
                  <span
                    className={
                      (metrics?.inflow_30d || 0) - (metrics?.outflow_30d || 0) >= 0
                        ? "text-[#00ff88]"
                        : "text-[#ff4444]"
                    }
                  >
                    {formatCurrency(
                      (metrics?.inflow_30d || 0) - (metrics?.outflow_30d || 0),
                      true
                    )}
                  </span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Total cleared inflows vs outflows over past 30 days
              </p>

              {/* Chart */}
              <div className="h-48 mt-4 w-full">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={cashFlowData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                    >
                      <XAxis
                        type="number"
                        stroke="#52525b"
                        fontSize={11}
                        tickFormatter={(val) => `$${val}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#71717a"
                        fontSize={12}
                        width={90}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          borderColor: "#27272a",
                          borderRadius: "8px",
                          color: "#ffffff",
                          fontSize: "12px",
                        }}
                        formatter={(val: any) => [formatCurrency(Number(val)), "Amount"]}
                      />
                      <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={28}>
                        {cashFlowData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
                    Loading chart...
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-zinc-900 text-xs font-mono">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-[#00ff88]" />
                <div>
                  <div className="text-zinc-500">Inflow</div>
                  <div className="text-[#00ff88] font-bold text-sm">
                    {formatCurrency(metrics?.inflow_30d || 0)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-[#ff4444]" />
                <div>
                  <div className="text-zinc-500">Outflow</div>
                  <div className="text-[#ff4444] font-bold text-sm">
                    {formatCurrency(metrics?.outflow_30d || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Bills (14d) */}
          <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-200 tracking-wide flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ffcc00]" />
                  <span>Upcoming Bills (Next 14 Days)</span>
                </h3>
                <span className="text-xs text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {upcomingBills14d.length} active
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Auto-detected recurring schedules holding cash reserve
              </p>

              <div className="mt-4 space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {upcomingBills14d.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-xs italic">
                    🎉 No bills scheduled in the next 14 days!
                  </div>
                ) : (
                  upcomingBills14d.map((bill) => {
                    const daysUntil = getDaysUntil(bill.next_expected_at);
                    return (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-black/50 border border-zinc-850 hover:border-zinc-700 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-[#ffcc00]" />
                          <div>
                            <div className="text-sm font-medium text-zinc-200">
                              {bill.merchant_pattern}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              Due: {formatDate(bill.next_expected_at)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-[#ffcc00]">
                            {formatCurrency(bill.expected_amount)}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {daysUntil !== null
                              ? daysUntil === 0
                                ? "Today"
                                : daysUntil === 1
                                ? "Tomorrow"
                                : `in ${daysUntil} days`
                              : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500">
              <span>Total 14d Reserve Needed:</span>
              <span className="font-mono font-bold text-[#ffcc00]">
                {formatCurrency(metrics?.upcoming_bills_14d || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Roasts Feed (Last 5 transactions where roast_sent=true) */}
        <div className="bg-zinc-950 rounded-xl border border-zinc-800/80 p-5 md:p-6 shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-850">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-lg text-white tracking-wide">
                Recent AI Roasts
              </h3>
              <span className="text-xs bg-orange-950/60 text-orange-400 border border-orange-900/40 px-2 py-0.5 rounded font-mono">
                Wall of Shame
              </span>
            </div>
            <span className="text-xs text-zinc-500 font-mono">
              Last {roasts.length} burns
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {roasts.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 text-sm italic">
                No recent roasts dispatched. Your wallet is currently behaving itself.
              </div>
            ) : (
              roasts.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 rounded-xl bg-black/60 border border-zinc-800/80 hover:border-orange-500/30 transition space-y-2"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-100 text-base">
                          {tx.merchant_clean || tx.merchant_raw}
                        </span>
                        <span className="text-[11px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800">
                          {tx.category || "Uncategorized"}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {formatDate(tx.posted_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-bold font-mono text-[#ff4444]">
                        {formatCurrency(tx.amount)}
                      </span>
                      <div className="text-[10px] text-orange-400/80 font-mono">
                        Roast Score: {tx.roast_score}/100
                      </div>
                    </div>
                  </div>

                  {/* Roast Message */}
                  {tx.roast_message && (
                    <div className="text-sm italic text-[#ffcc00] font-sans bg-yellow-950/20 p-2.5 rounded-lg border border-yellow-900/30">
                      "{tx.roast_message}"
                    </div>
                  )}

                  {/* User Justification / Excuse */}
                  {tx.user_justification ? (
                    <div className="text-xs text-zinc-400 bg-zinc-900/60 p-2 rounded border border-zinc-800/60 flex items-start gap-2">
                      <span className="text-zinc-500 font-semibold shrink-0">
                        Your Excuse:
                      </span>
                      <span className="italic text-zinc-300">
                        "{tx.user_justification}"
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-600 italic">
                      No justification submitted yet. (Reply via Telegram or SMS to dispute)
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-zinc-600 pb-6">
        Finance Roast System • Self-Hosted Local Node • 10.10.10.4
      </footer>
    </div>
  );
}
