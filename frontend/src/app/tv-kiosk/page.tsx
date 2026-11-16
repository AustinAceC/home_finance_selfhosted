"use client";

import React, { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getMetrics,
  getTransactions,
  getRecurring,
  getPrivacy,
  MetricsSummary,
  Transaction,
  RecurringSchedule,
} from "@/lib/api";
import { formatCurrency, formatDate, getDaysUntil } from "@/lib/utils";
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
} from "lucide-react";

function KioskContent() {
  const searchParams = useSearchParams();
  const privacyParam = searchParams.get("privacy");

  const [currentSlide, setCurrentSlide] = useState(0); // 0 = Buckets, 1 = Wall of Shame, 2 = Upcoming Bills
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [roasts, setRoasts] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringSchedule[]>([]);
  const [guestPrivacy, setGuestPrivacy] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  // Check guest privacy from URL param or API
  const isPrivacyActive = privacyParam === "true" || guestPrivacy;

  const loadData = useCallback(async () => {
    try {
      const [metricsData, roastsData, recurringData, privacyData] = await Promise.all([
        getMetrics().catch((err) => {
          console.warn("Kiosk metrics error:", err);
          return null;
        }),
        getTransactions({ roast_sent: true, limit: 5 }).catch((err) => {
          console.warn("Kiosk roasts error:", err);
          return [];
        }),
        getRecurring().catch((err) => {
          console.warn("Kiosk recurring error:", err);
          return [];
        }),
        getPrivacy().catch((err) => {
          console.warn("Kiosk privacy error:", err);
          return { guest_privacy_mode: false };
        }),
      ]);

      if (metricsData) setMetrics(metricsData);
      setRoasts(roastsData || []);
      setRecurring(recurringData || []);
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

  // 20-second Carousel cycling + visual progress
  useEffect(() => {
    const slideDuration = 20000;
    const tickInterval = 200;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += tickInterval;
      setProgress((elapsed / slideDuration) * 100);

      if (elapsed >= slideDuration) {
        elapsed = 0;
        setCurrentSlide((prev) => (prev + 1) % 3);
        setProgress(0);
      }
    }, tickInterval);

    return () => clearInterval(timer);
  }, []);

  // Privacy formatters
  const displayAmount = (
    amount: number,
    opts?: { sign?: boolean; invert?: boolean }
  ) => {
    if (isPrivacyActive) {
      // Obfuscated percentage / score
      const score = Math.min(100, Math.max(10, Math.round(Math.abs(amount) % 89 + 11)));
      return `${score}% Index`;
    }
    const val = opts?.invert ? -Math.abs(amount) : amount;
    return formatCurrency(val, opts?.sign);
  };

  // Upcoming bills sorted by date
  const now = new Date();
  const sortedUpcoming = [...recurring]
    .filter((b) => b.active && b.next_expected_at)
    .sort(
      (a, b) =>
        new Date(a.next_expected_at!).getTime() -
        new Date(b.next_expected_at!).getTime()
    )
    .slice(0, 5);

  return (
    <div className="fixed inset-0 bg-[#000000] text-white overflow-hidden select-none cursor-none flex flex-col justify-between p-10 md:p-14">
      {/* Subtle OLED Pixel-Shift Container (orbits 15px every 60s) */}
      <div className="w-full h-full flex flex-col justify-between animate-pixel-shift">
        {/* Top Kiosk Bar */}
        <header className="flex items-center justify-between pb-6 border-b border-zinc-900">
          <div className="flex items-center gap-4">
            <span className="text-4xl">💸</span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-wider text-white">
                FINANCE HQ
              </h1>
              <p className="text-zinc-650 text-sm font-mono tracking-widest uppercase">
                SHIELD TV AMBIENT RADAR
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {isPrivacyActive && (
              <div className="flex items-center gap-2 bg-zinc-950 px-4 py-2 rounded-lg border border-zinc-800 text-sm font-mono text-zinc-400">
                <Shield className="w-4 h-4 text-[#4488ff]" />
                <span>GUEST PRIVACY ACTIVE</span>
              </div>
            )}
            <div className="text-4xl font-mono font-bold text-zinc-300 tracking-tight">
              {currentTime || "--:--"}
            </div>
          </div>
        </header>

        {/* Carousel Content Stage */}
        <main className="flex-1 flex flex-col justify-center my-6">
          {/* SLIDE 1: The 4 Buckets & Safe-to-Spend */}
          {currentSlide === 0 && (
            <div className="space-y-8 animate-fadeIn">
              {/* Hero Safe-to-Spend */}
              <div className="text-center py-4 bg-black border border-zinc-900 rounded-2xl p-6">
                <div className="text-lg md:text-xl font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  True Safe-to-Spend (After Debt & 14D Bills)
                </div>
                <div className="text-7xl md:text-9xl font-mono font-black text-[#00ff88] tracking-tight drop-shadow-[0_0_35px_rgba(0,255,136,0.25)]">
                  {metrics
                    ? displayAmount(metrics.true_safe_to_spend)
                    : "$0.00"}
                </div>
                <div className="text-zinc-500 text-base md:text-lg mt-3 font-medium">
                  Allocated day-to-day liquidity ready for deployment
                </div>
              </div>

              {/* 2x2 Grid of 4 Buckets */}
              <div className="grid grid-cols-2 gap-6">
                {/* Day-to-Day */}
                <div className="bg-black p-6 rounded-xl border border-zinc-900 flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-[#00ff88]" />
                    <span className="text-xl md:text-2xl font-bold text-zinc-300 uppercase tracking-wide">
                      Day-to-Day
                    </span>
                  </div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-[#00ff88] mt-4">
                    {metrics ? displayAmount(metrics.day_to_day_balance) : "$0.00"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2 font-mono">
                    Active Checking & Operating Cash
                  </div>
                </div>

                {/* Short-Term Debt */}
                <div className="bg-black p-6 rounded-xl border border-zinc-900 flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-[#ff4444]" />
                    <span className="text-xl md:text-2xl font-bold text-zinc-300 uppercase tracking-wide">
                      Credit Cards / Debt
                    </span>
                  </div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-[#ff4444] mt-4">
                    {metrics
                      ? isPrivacyActive
                        ? displayAmount(metrics.short_term_debt_balance)
                        : `-${formatCurrency(metrics.short_term_debt_balance)}`
                      : "$0.00"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2 font-mono">
                    Short-Term Float Liabilities
                  </div>
                </div>

                {/* Savings */}
                <div className="bg-black p-6 rounded-xl border border-zinc-900 flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-[#4488ff]" />
                    <span className="text-xl md:text-2xl font-bold text-zinc-300 uppercase tracking-wide">
                      Emergency Savings
                    </span>
                  </div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-[#4488ff] mt-4">
                    {metrics ? displayAmount(metrics.savings_balance) : "$0.00"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2 font-mono">
                    High-Yield Reserve Liquid Cushion
                  </div>
                </div>

                {/* Retirement */}
                <div className="bg-black p-6 rounded-xl border border-zinc-900 flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-zinc-500" />
                    <span className="text-xl md:text-2xl font-bold text-zinc-400 uppercase tracking-wide">
                      Retirement (Off-Budget)
                    </span>
                  </div>
                  <div className="text-4xl md:text-5xl font-mono font-bold text-zinc-400 mt-4">
                    {metrics ? displayAmount(metrics.retirement_balance) : "$0.00"}
                  </div>
                  <div className="text-xs text-zinc-600 mt-2 font-mono">
                    401(k), IRA & Long-Term Investments
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 2: Wall of Shame */}
          {currentSlide === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🔥</span>
                  <h2 className="text-3xl md:text-4xl font-extrabold tracking-wide text-white">
                    Wall of Shame
                  </h2>
                </div>
                <span className="text-sm font-mono text-zinc-500 uppercase">
                  Recent AI Disciplinary Actions
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {roasts.slice(0, 3).length === 0 ? (
                  <div className="col-span-3 text-center py-20 text-zinc-600 text-2xl italic">
                    No recent violations found. Wallet discipline intact.
                  </div>
                ) : (
                  roasts.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="bg-black border border-zinc-850 rounded-2xl p-6 flex flex-col justify-between h-[380px] shadow-lg"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="text-2xl font-bold text-zinc-100 truncate pr-2">
                            {item.merchant_clean || item.merchant_raw}
                          </div>
                          <span className="text-xs font-mono bg-zinc-900 text-zinc-400 px-2 py-1 rounded border border-zinc-800">
                            {formatDate(item.posted_at)}
                          </span>
                        </div>

                        <div className="text-4xl font-mono font-bold text-[#ff4444] mt-3">
                          {displayAmount(item.amount)}
                        </div>

                        {/* Roast Message */}
                        <div className="mt-5 text-xl italic text-[#ffcc00] leading-snug font-sans">
                          "{item.roast_message || "Questionable purchase detected."}"
                        </div>
                      </div>

                      {/* User Excuse */}
                      <div className="pt-4 border-t border-zinc-900 mt-4">
                        <div className="text-xs uppercase font-mono tracking-wider text-zinc-600 mb-1">
                          User Justification:
                        </div>
                        <div className="text-sm italic text-zinc-400 line-clamp-2">
                          {item.user_justification
                            ? `"${item.user_justification}"`
                            : "No excuse provided. Guilt admitted silently."}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SLIDE 3: Upcoming 14-Day Recurring Radar */}
          {currentSlide === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">📅</span>
                  <h2 className="text-3xl md:text-4xl font-extrabold tracking-wide text-white">
                    Upcoming Bills
                  </h2>
                </div>
                <div className="text-sm font-mono text-zinc-500 uppercase">
                  14-Day Cash Reserve Radar
                </div>
              </div>

              <div className="space-y-4 pt-4">
                {sortedUpcoming.length === 0 ? (
                  <div className="text-center py-20 text-zinc-600 text-2xl italic">
                    Clear radar. No recurring bills detected in upcoming cycle.
                  </div>
                ) : (
                  sortedUpcoming.map((bill) => {
                    const daysUntil = getDaysUntil(bill.next_expected_at);
                    return (
                      <div
                        key={bill.id}
                        className="bg-black border border-zinc-850 rounded-xl p-5 flex items-center justify-between shadow-md"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-3.5 h-3.5 rounded-full bg-[#ffcc00]" />
                          <div>
                            <div className="text-2xl font-bold text-zinc-100">
                              {bill.merchant_pattern}
                            </div>
                            <div className="text-sm text-zinc-500 font-mono mt-0.5">
                              Frequency: {bill.frequency} • Due:{" "}
                              {formatDate(bill.next_expected_at)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-6">
                          <div>
                            <div className="text-3xl font-mono font-bold text-[#ffcc00]">
                              {displayAmount(bill.expected_amount)}
                            </div>
                            <div className="text-sm font-mono text-zinc-400">
                              {daysUntil !== null
                                ? daysUntil <= 0
                                  ? "DUE TODAY"
                                  : daysUntil === 1
                                  ? "DUE TOMORROW"
                                  : `IN ${daysUntil} DAYS`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Status & Carousel Progress Bar */}
        <footer className="pt-4 border-t border-zinc-900">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-600 mb-3">
            <div className="flex items-center gap-4">
              <span
                className={`transition-colors ${
                  currentSlide === 0 ? "text-[#00ff88] font-bold" : "text-zinc-600"
                }`}
              >
                1. 4-BUCKETS
              </span>
              <span>•</span>
              <span
                className={`transition-colors ${
                  currentSlide === 1 ? "text-[#ffcc00] font-bold" : "text-zinc-600"
                }`}
              >
                2. WALL OF SHAME
              </span>
              <span>•</span>
              <span
                className={`transition-colors ${
                  currentSlide === 2 ? "text-[#4488ff] font-bold" : "text-zinc-600"
                }`}
              >
                3. RECURRING RADAR
              </span>
            </div>

            <div>AUTO-CYCLE: 20s • PURE OLED COMPLIANT</div>
          </div>

          {/* Progress Bar */}
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
