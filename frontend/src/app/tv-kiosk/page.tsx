"use client";

import React, { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getMetrics,
  getTransactions,
  getCalendarBills,
  getPrivacy,
  MetricsSummary,
  Transaction,
  BillCalendarItem,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Flame,
  Calendar,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Shield,
  Clock,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

function KioskContent() {
  const searchParams = useSearchParams();
  const privacyParam = searchParams.get("privacy");

  // 0 = 4 Buckets + Burn Rate, 1 = 3 Checking Accounts Radar, 2 = Wall of Shame, 3 = Upcoming Bills
  const [currentSlide, setCurrentSlide] = useState(0);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [roasts, setRoasts] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<BillCalendarItem[]>([]);
  const [guestPrivacy, setGuestPrivacy] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  const isPrivacyActive = privacyParam === "true" || guestPrivacy;

  const loadData = useCallback(async () => {
    try {
      const [metricsData, roastsData, billsData, privacyData] = await Promise.all([
        getMetrics().catch((err) => {
          console.warn("Kiosk metrics error:", err);
          return null;
        }),
        getTransactions({ roast_sent: true, limit: 5 }).catch((err) => {
          console.warn("Kiosk roasts error:", err);
          return [];
        }),
        getCalendarBills().catch((err) => {
          console.warn("Kiosk bills error:", err);
          return [];
        }),
        getPrivacy().catch((err) => {
          console.warn("Kiosk privacy error:", err);
          return { guest_privacy_mode: false };
        }),
      ]);

      if (metricsData) setMetrics(metricsData);
      setRoasts(roastsData || []);
      setBills(billsData || []);
      setGuestPrivacy(privacyData.guest_privacy_mode);
    } catch (e) {
      console.error("Kiosk data load error:", e);
    }
  }, []);

  // Clock & Initial Load & 5-minute Auto Refresh
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const clockTimer = setInterval(updateTime, 1000);

    loadData();

    const dataInterval = setInterval(() => {
      loadData();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(dataInterval);
    };
  }, [loadData]);

  // 20-second Carousel cycling (4 slides)
  useEffect(() => {
    const slideDuration = 20000;
    const tickInterval = 200;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += tickInterval;
      setProgress((elapsed / slideDuration) * 100);

      if (elapsed >= slideDuration) {
        elapsed = 0;
        setCurrentSlide((prev) => (prev + 1) % 5);
        setProgress(0);
      }
    }, tickInterval);

    return () => clearInterval(timer);
  }, []);

  const displayAmount = (
    amount: number,
    opts?: { sign?: boolean; invert?: boolean }
  ) => {
    if (isPrivacyActive) {
      const score = Math.min(100, Math.max(10, Math.round((Math.abs(amount) % 89) + 11)));
      return `${score}% Index`;
    }
    const val = opts?.invert ? -Math.abs(amount) : amount;
    return formatCurrency(val, opts?.sign);
  };

  const safeToSpend = metrics?.true_safe_to_spend ?? 0;
  const burnRate = metrics?.burn_rate;

  return (
    <div className="fixed inset-0 bg-[#000000] text-white overflow-hidden select-none cursor-none flex flex-col justify-between p-8 md:p-12">
      {/* Subtle OLED Pixel-Shift Container */}
      <div className="w-full h-full flex flex-col justify-between animate-pixel-shift">
        {/* Top Kiosk Bar */}
        <header className="flex items-center justify-between pb-5 border-b border-zinc-900">
          <div className="flex items-center gap-4">
            <span className="text-3xl font-black tracking-tight text-[#00ff88]">💸 HQ HUD</span>
            <span className="text-zinc-600 font-mono text-sm">|</span>
            <span className="text-zinc-400 font-mono text-xs uppercase tracking-widest">
              Nvidia Shield TV Ambient Display
            </span>
          </div>

          <div className="flex items-center gap-6">
            {isPrivacyActive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-900 border border-zinc-800 text-[#00ff88] text-xs font-mono">
                <Shield className="w-3.5 h-3.5" />
                <span>GUEST PRIVACY MASK ON</span>
              </div>
            )}
            <div className="text-2xl font-mono font-bold text-zinc-300">{currentTime}</div>
          </div>
        </header>

        {/* Dynamic Slide View */}
        <main className="flex-1 flex flex-col justify-center py-6">
          {/* SLIDE 0: 4 Core Buckets & Burn Rate HUD */}
          {currentSlide === 0 && (
            <div className="space-y-8 animate-fadeIn">
              {/* Safe to Spend & Burn Rate Header Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-zinc-900">
                <div>
                  <div className="text-xs uppercase font-mono text-zinc-500 tracking-wider">
                    Liquid Checking Cash · After Cards & 14d Bills
                  </div>
                  <div
                    className={`text-5xl md:text-7xl font-mono font-black tracking-tight my-1 ${
                      safeToSpend >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"
                    }`}
                  >
                    {displayAmount(safeToSpend)}
                  </div>
                  <div className="text-xs font-mono text-zinc-400">TRUE SAFE-TO-SPEND</div>
                </div>

                <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span>MONTHLY BURN VELOCITY</span>
                    </span>
                    <span className="font-bold text-white uppercase">{burnRate?.status}</span>
                  </div>
                  <div className="text-3xl font-black font-mono text-white my-1">
                    {burnRate?.burn_rate_pct ?? 0}%
                    <span className="text-xs font-normal text-zinc-500 ml-2">of 30-day income</span>
                  </div>
                  <div className="text-xs font-mono text-zinc-400">
                    Target Safe Daily Pace:{" "}
                    <span className="text-[#00ff88] font-bold">
                      {displayAmount(burnRate?.safe_daily_spend ?? 0)}/day
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Buckets Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* 1. Day-to-Day */}
                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase mb-2">
                    <Wallet className="w-4 h-4 text-[#00ff88]" />
                    <span>Day-to-Day Checking</span>
                  </div>
                  <div className="text-4xl font-mono font-bold text-[#00ff88]">
                    {displayAmount(metrics?.day_to_day_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-3">3 Main Checking Accounts</div>
                </div>

                {/* 2. Short-Term Debt */}
                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase mb-2">
                    <CreditCard className="w-4 h-4 text-[#ff4444]" />
                    <span>Short-Term Debt</span>
                  </div>
                  <div className="text-4xl font-mono font-bold text-[#ff4444]">
                    {displayAmount(metrics?.short_term_debt_balance ?? 0, { invert: true })}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-3">BofA · Discover · Home Depot</div>
                </div>

                {/* 3. Savings */}
                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase mb-2">
                    <PiggyBank className="w-4 h-4 text-[#4488ff]" />
                    <span>Savings & Reserves</span>
                  </div>
                  <div className="text-4xl font-mono font-bold text-[#4488ff]">
                    {displayAmount(metrics?.savings_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-3">HYSA / Brokerage Reserves</div>
                </div>

                {/* 4. Retirement */}
                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span>Retirement & Wealth</span>
                  </div>
                  <div className="text-4xl font-mono font-bold text-purple-400">
                    {displayAmount(metrics?.retirement_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-3">Fidelity 401(k) · IRAs · Off-Budget</div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 1: Daily Burn Rate & Velocity Radar */}
          {currentSlide === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🔥</span>
                  <h2 className="text-3xl font-extrabold tracking-wide text-white">
                    Daily Burn Velocity Radar
                  </h2>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-[#00ff88]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88]" />
                    SAFE DAILY PACE
                  </span>
                  <span className="flex items-center gap-1.5 text-[#ff4444]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff4444]" />
                    OVER SPEED LIMIT
                  </span>
                  <span className="flex items-center gap-1.5 text-[#ffcc00]">
                    <span className="w-3 h-0.5 bg-[#ffcc00]" />
                    SPEED LIMIT
                  </span>
                </div>
              </div>

              {/* 4 Top KPI Stat Cards for TV */}
              <div className="grid grid-cols-4 gap-6">
                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs uppercase font-mono text-zinc-500 mb-1">
                    Safe Speed Limit
                  </div>
                  <div className="text-3xl font-mono font-black text-[#ffcc00]">
                    {displayAmount(burnRate?.safe_daily_spend ?? 0)}/d
                  </div>
                  <div className="text-[11px] text-zinc-600 font-mono mt-1">
                    Target max spend per day
                  </div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs uppercase font-mono text-zinc-500 mb-1">
                    14-Day Avg Spend
                  </div>
                  <div className="text-3xl font-mono font-black text-white">
                    {displayAmount(
                      (metrics?.daily_burn_trend || []).length > 0
                        ? (metrics?.daily_burn_trend || []).reduce((s, p) => s + p.actual_spend, 0) /
                          (metrics?.daily_burn_trend || []).length
                        : 0
                    )}/d
                  </div>
                  <div className="text-[11px] text-zinc-600 font-mono mt-1">
                    Actual average outflow
                  </div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs uppercase font-mono text-zinc-500 mb-1">
                    Monthly Pace
                  </div>
                  <div className="text-3xl font-mono font-black text-white">
                    {burnRate?.burn_rate_pct ?? 0}%
                  </div>
                  <div className="text-[11px] text-[#00ff88] font-mono mt-1 uppercase font-bold">
                    {burnRate?.status ?? "Normal"} Status
                  </div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs uppercase font-mono text-zinc-500 mb-1">
                    Spike Days
                  </div>
                  {(() => {
                    const overDays = (metrics?.daily_burn_trend || []).filter((p) => p.is_over_limit).length;
                    return (
                      <div className={`text-3xl font-mono font-black ${overDays > 0 ? "text-[#ff4444]" : "text-[#00ff88]"}`}>
                        {overDays} of {(metrics?.daily_burn_trend || []).length}
                      </div>
                    );
                  })()}
                  <div className="text-[11px] text-zinc-600 font-mono mt-1">
                    Days exceeding speed limit
                  </div>
                </div>
              </div>

              {/* Full-Width TV Bar Chart */}
              <div className="bg-black border border-zinc-900 rounded-2xl p-6 h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics?.daily_burn_trend || []} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" vertical={false} />
                    <XAxis dataKey="date" stroke="#666" fontSize={13} tickLine={false} fontFamily="monospace" />
                    <YAxis stroke="#666" fontSize={13} tickLine={false} tickFormatter={(v) => `$${v}`} fontFamily="monospace" />
                    {burnRate?.safe_daily_spend && burnRate.safe_daily_spend > 0 && (
                      <ReferenceLine
                        y={burnRate.safe_daily_spend}
                        stroke="#ffcc00"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{
                          value: `SPEED LIMIT ($${Math.round(burnRate.safe_daily_spend)}/DAY)`,
                          fill: "#ffcc00",
                          position: "top",
                          fontSize: 12,
                          fontFamily: "monospace",
                        }}
                      />
                    )}
                    <Bar dataKey="actual_spend" name="Daily Outflow" radius={[4, 4, 0, 0]}>
                      {(metrics?.daily_burn_trend || []).map((entry, idx) => (
                        <Cell
                          key={`tv-cell-${idx}`}
                          fill={entry.is_over_limit ? "#ff4444" : "#00ff88"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* SLIDE 2: 3 Dedicated Checking Accounts Radar */}
          {currentSlide === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🏦</span>
                  <h2 className="text-3xl font-extrabold tracking-wide text-white">
                    Checking Accounts Radar
                  </h2>
                </div>
                <div className="text-xs font-mono text-zinc-500 uppercase">
                  Daily Spend · Mortgage Escrow · Utilities & Subs
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {(metrics?.checking_accounts || []).slice(0, 3).map((acct) => (
                  <div
                    key={acct.id}
                    className="bg-black border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs font-mono text-[#00ff88] uppercase mb-1">
                        {acct.account_role === "primary_spend"
                          ? "💳 Everyday Spend & CC Payoff"
                          : acct.account_role === "mortgage"
                          ? "🏡 Mortgage & Work Deposits"
                          : "📑 Utilities & Subscriptions"}
                      </div>
                      <div className="text-xl font-bold text-white truncate">
                        {acct.custom_name || acct.name}
                      </div>
                      <div className="text-xs text-zinc-500 font-mono mb-4">{acct.institution}</div>

                      <div className="text-4xl font-mono font-black text-white mb-4">
                        {displayAmount(acct.current_balance)}
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-zinc-950 border border-zinc-900 p-3 rounded-lg text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-zinc-500 block">30d In</span>
                          <span className="text-emerald-400 font-bold">
                            +{displayAmount(acct.inflow_30d)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">30d Out</span>
                          <span className="text-rose-400 font-bold">
                            -{displayAmount(acct.outflow_30d)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">Net</span>
                          <span
                            className={`font-bold ${
                              acct.net_cashflow >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {displayAmount(acct.net_cashflow)}
                          </span>
                        </div>
                      </div>

                      {acct.warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {acct.warnings.map((w, idx) => (
                            <div
                              key={idx}
                              className="text-xs font-mono text-rose-300 flex items-center gap-1.5"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                              <span className="truncate">{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE 3: Wall of Shame (AI Roasts) */}
          {currentSlide === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🔥</span>
                  <h2 className="text-3xl font-extrabold tracking-wide text-white">Wall of Shame</h2>
                </div>
                <div className="text-xs font-mono text-zinc-500 uppercase">
                  AI Financial Parole Officer
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {roasts.length === 0 ? (
                  <div className="col-span-full py-20 text-center text-zinc-600 text-xl font-mono">
                    No recent offences recorded. Good financial behavior detected.
                  </div>
                ) : (
                  roasts.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="bg-black border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                          <span className="font-bold text-white truncate max-w-[200px]">
                            {item.merchant_clean || item.merchant_raw}
                          </span>
                          <span>{formatDate(item.posted_at)}</span>
                        </div>

                        <div className="text-4xl font-mono font-bold text-[#ff4444] my-3">
                          {displayAmount(item.amount)}
                        </div>

                        <div className="text-lg italic text-[#ffcc00] leading-snug font-sans bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                          &ldquo;{item.roast_message || "Questionable purchase detected."}&rdquo;
                        </div>
                      </div>

                      <div className="pt-4 border-t border-zinc-900 mt-4 text-xs font-mono">
                        <span className="text-zinc-600 block uppercase mb-1">User Excuse:</span>
                        <span className="text-zinc-400 italic line-clamp-2">
                          {item.user_justification || "No excuse provided. Guilt admitted silently."}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SLIDE 4: Upcoming 45-Day Bills Calendar Radar */}
          {currentSlide === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📅</span>
                  <h2 className="text-3xl font-extrabold tracking-wide text-white">Upcoming Bills</h2>
                </div>
                <div className="text-xs font-mono text-zinc-500 uppercase">
                  45-Day Cash Reserve Radar
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {bills.length === 0 ? (
                  <div className="text-center py-20 text-zinc-600 text-xl font-mono">
                    Clear radar. No recurring bills detected in the upcoming cycle.
                  </div>
                ) : (
                  bills.slice(0, 5).map((bill) => (
                    <div
                      key={bill.id}
                      className="bg-black border border-zinc-800 rounded-xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-3.5 h-3.5 rounded-full ${
                            bill.status === "due_today"
                              ? "bg-rose-500"
                              : bill.status === "due_soon"
                              ? "bg-amber-400"
                              : "bg-[#00ff88]"
                          }`}
                        />
                        <div>
                          <div className="text-xl font-bold text-white">{bill.title}</div>
                          <div className="text-xs text-zinc-500 font-mono mt-0.5">
                            Due {bill.due_date} ({bill.frequency})
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-white">
                          {displayAmount(bill.expected_amount)}
                        </div>
                        <div className="text-xs font-mono font-bold text-[#ffcc00]">
                          {bill.days_until <= 0
                            ? "DUE TODAY"
                            : bill.days_until === 1
                            ? "DUE TOMORROW"
                            : `IN ${bill.days_until} DAYS`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Status & Carousel Progress Bar */}
        <footer className="pt-4 border-t border-zinc-900">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-600 mb-3">
            <div className="flex items-center gap-4">
              <span className={currentSlide === 0 ? "text-[#00ff88] font-bold" : ""}>
                1. 4-BUCKETS
              </span>
              <span>•</span>
              <span className={currentSlide === 1 ? "text-orange-400 font-bold" : ""}>
                2. BURN GRAPH
              </span>
              <span>•</span>
              <span className={currentSlide === 2 ? "text-[#4488ff] font-bold" : ""}>
                3. CHECKING RADAR
              </span>
              <span>•</span>
              <span className={currentSlide === 3 ? "text-[#ffcc00] font-bold" : ""}>
                4. WALL OF SHAME
              </span>
              <span>•</span>
              <span className={currentSlide === 4 ? "text-purple-400 font-bold" : ""}>
                5. BILLS CALENDAR
              </span>
            </div>

            <div>AUTO-CYCLE: 20s • PURE OLED COMPLIANT</div>
          </div>

          <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-700 transition-all ease-linear duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function TvKioskPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#000000] text-zinc-600 flex items-center justify-center font-mono">
          Loading Shield TV Kiosk...
        </div>
      }
    >
      <KioskContent />
    </Suspense>
  );
}
