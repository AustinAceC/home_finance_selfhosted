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
  Calendar,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Shield,
  Sparkles,
  AlertCircle,
  Building2,
  Layers,
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
  AreaChart,
  Area,
  Legend,
} from "recharts";

function KioskContent() {
  const searchParams = useSearchParams();
  const privacyParam = searchParams.get("privacy");

  // 0 = 4 Buckets & Net Cashflow, 1 = Cashflow Trajectory Chart, 2 = Checking Radar, 3 = Advisor Insights, 4 = Upcoming Bills
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

  // 20-second Carousel cycling
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
  const inflow30d = metrics?.inflow_30d ?? 0;
  const outflow30d = metrics?.outflow_30d ?? 0;
  const net30d = inflow30d - outflow30d;

  const cashflowTrend = metrics?.cashflow_trend || [];

  return (
    <div className="fixed inset-0 bg-[#000000] text-zinc-100 overflow-hidden select-none cursor-none flex flex-col justify-between p-8 md:p-12 font-sans">
      {/* Subtle OLED Pixel-Shift Container */}
      <div className="w-full h-full flex flex-col justify-between animate-pixel-shift">
        {/* Top Kiosk Bar */}
        <header className="flex items-center justify-between pb-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-white">Finance Command</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500 text-xs tracking-wider uppercase">Ambient Display</span>
          </div>

          <div className="flex items-center gap-6">
            {isPrivacyActive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-emerald-400 text-xs">
                <Shield className="w-3.5 h-3.5" />
                <span>Privacy Mode Active</span>
              </div>
            )}
            <div className="text-2xl font-mono font-medium text-zinc-300">{currentTime}</div>
          </div>
        </header>

        {/* Dynamic Slide View */}
        <main className="flex-1 flex flex-col justify-center py-6">
          {/* SLIDE 0: 4 Core Buckets & Net Cashflow */}
          {currentSlide === 0 && (
            <div className="space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-zinc-900">
                <div>
                  <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Liquid Checking Cashflow (Net of Debt & 14d Obligations)
                  </div>
                  <div
                    className={`text-6xl md:text-7xl font-mono font-semibold tracking-tight my-2 ${
                      safeToSpend >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {displayAmount(safeToSpend)}
                  </div>
                  <div className="text-xs text-zinc-400">Available Safe-to-Spend</div>
                </div>

                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>30-Day Net Cashflow Position</span>
                    </span>
                    <span className="font-semibold text-white uppercase">
                      {net30d >= 0 ? "Surplus" : "Deficit"}
                    </span>
                  </div>
                  <div
                    className={`text-4xl font-semibold font-mono my-2 ${
                      net30d >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {net30d >= 0 ? `+${displayAmount(net30d)}` : displayAmount(net30d)}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Inflow: <span className="text-emerald-400 font-mono">+{displayAmount(inflow30d)}</span> · Outflow: <span className="text-zinc-300 font-mono">-{displayAmount(outflow30d)}</span>
                  </div>
                </div>
              </div>

              {/* 4 Buckets Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-3">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>Day-to-Day Checking</span>
                  </div>
                  <div className="text-3xl font-mono font-semibold text-emerald-400">
                    {displayAmount(metrics?.day_to_day_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">Active Operating Balances</div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-3">
                    <CreditCard className="w-4 h-4 text-rose-400" />
                    <span>Short-Term Debt</span>
                  </div>
                  <div className="text-3xl font-mono font-semibold text-rose-400">
                    {displayAmount(metrics?.short_term_debt_balance ?? 0, { invert: true })}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">Credit Card Float</div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-3">
                    <PiggyBank className="w-4 h-4 text-blue-400" />
                    <span>Savings & Reserves</span>
                  </div>
                  <div className="text-3xl font-mono font-semibold text-blue-400">
                    {displayAmount(metrics?.savings_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">Emergency & Short-Term Funds</div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-3">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span>Retirement & Wealth</span>
                  </div>
                  <div className="text-3xl font-mono font-semibold text-purple-400">
                    {displayAmount(metrics?.retirement_balance ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">Investments & Portfolios</div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 1: 14-Day Cashflow Dynamics Bar Chart */}
          {currentSlide === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Cashflow Dynamics (14 Days)
                  </h2>
                </div>
                <div className="flex items-center gap-5 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Inflow
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-zinc-600" />
                    Outflow
                  </span>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs text-zinc-500 mb-1">14d Total Inflow</div>
                  <div className="text-2xl font-mono font-semibold text-emerald-400">
                    +{displayAmount(cashflowTrend.reduce((s, c) => s + c.inflow, 0))}
                  </div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs text-zinc-500 mb-1">14d Total Outflow</div>
                  <div className="text-2xl font-mono font-semibold text-zinc-300">
                    -{displayAmount(cashflowTrend.reduce((s, c) => s + c.outflow, 0))}
                  </div>
                </div>

                <div className="bg-black border border-zinc-900 rounded-2xl p-5">
                  <div className="text-xs text-zinc-500 mb-1">14d Net Position</div>
                  {(() => {
                    const net14 = cashflowTrend.reduce((s, c) => s + c.net, 0);
                    return (
                      <div className={`text-2xl font-mono font-semibold ${net14 >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {net14 >= 0 ? `+${displayAmount(net14)}` : displayAmount(net14)}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Chart */}
              <div className="bg-black border border-zinc-900 rounded-2xl p-6 h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflowTrend} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                    <XAxis dataKey="date" stroke="#52525b" fontSize={12} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={12} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <Bar dataKey="inflow" name="Inflow (+)" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Outflow (-)" fill="#71717a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* SLIDE 2: 3 Dedicated Checking Accounts Radar */}
          {currentSlide === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Checking Accounts Radar
                  </h2>
                </div>
                <div className="text-xs text-zinc-500">Operating Cashflow Segregation</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {(metrics?.checking_accounts || []).slice(0, 3).map((acct) => (
                  <div
                    key={acct.id}
                    className="bg-black border border-zinc-900 rounded-2xl p-6 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs text-emerald-400 font-medium mb-1">
                        {acct.account_role === "primary_spend"
                          ? "Primary Spend & Card Payoff"
                          : acct.account_role === "mortgage"
                          ? "Mortgage & Payroll Deposits"
                          : "Utilities & Subscriptions"}
                      </div>
                      <div className="text-lg font-semibold text-white truncate">
                        {acct.custom_name || acct.name}
                      </div>
                      <div className="text-xs text-zinc-500 mb-4">{acct.institution}</div>

                      <div className="text-3xl font-mono font-semibold text-white mb-4">
                        {displayAmount(acct.current_balance)}
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-zinc-950 border border-zinc-900 p-3 rounded-xl text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-sans">In</span>
                          <span className="text-emerald-400 font-medium">
                            +{displayAmount(acct.inflow_30d)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-sans">Out</span>
                          <span className="text-zinc-400 font-medium">
                            -{displayAmount(acct.outflow_30d)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block font-sans">Net</span>
                          <span
                            className={`font-medium ${
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
                              className="text-xs text-rose-300 flex items-center gap-1.5"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
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

          {/* SLIDE 3: Advisor Highlights */}
          {currentSlide === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-2xl font-semibold tracking-tight text-white">Advisor Reviews</h2>
                </div>
                <div className="text-xs text-zinc-500">Marcus — Direct Feedback</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {roasts.length === 0 ? (
                  <div className="col-span-full py-20 text-center text-zinc-600 text-lg">
                    No recent flags or discretionary alerts logged.
                  </div>
                ) : (
                  roasts.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="bg-black border border-zinc-900 rounded-2xl p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span className="font-semibold text-white truncate max-w-[200px]">
                            {item.merchant_clean || item.merchant_raw}
                          </span>
                          <span>{formatDate(item.posted_at)}</span>
                        </div>

                        <div className="text-3xl font-mono font-semibold text-rose-400 my-3">
                          {displayAmount(item.amount)}
                        </div>

                        <div className="text-sm italic text-zinc-300 leading-relaxed bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                          &ldquo;{item.roast_message || "Expense under evaluation."}&rdquo;
                        </div>
                      </div>

                      <div className="pt-4 border-t border-zinc-900 mt-4 text-xs">
                        <span className="text-zinc-500 block uppercase mb-1">Category Note:</span>
                        <span className="text-zinc-400 italic">
                          {item.user_justification || "Awaiting justification."}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SLIDE 4: Upcoming Bills */}
          {currentSlide === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  <h2 className="text-2xl font-semibold tracking-tight text-white">Upcoming Obligations</h2>
                </div>
                <div className="text-xs text-zinc-500">Fixed & Variable Commitments</div>
              </div>

              <div className="space-y-3 pt-2">
                {bills.length === 0 ? (
                  <div className="text-center py-20 text-zinc-600 text-lg">
                    Clear forecast. No recurring bills detected in this window.
                  </div>
                ) : (
                  bills.slice(0, 5).map((bill) => (
                    <div
                      key={bill.id}
                      className="bg-black border border-zinc-900 rounded-xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            bill.status === "due_today"
                              ? "bg-rose-400"
                              : bill.status === "due_soon"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-medium text-white">{bill.title}</span>
                            {bill.is_estimated && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                Estimated
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            Due {bill.due_date} ({bill.frequency}) · {bill.recurring_type === "variable" ? "Variable" : "Fixed"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-mono font-semibold text-white">
                          {bill.is_estimated ? "~" : ""}{displayAmount(bill.expected_amount)}
                        </div>
                        <div className="text-xs text-amber-300 font-medium">
                          {bill.days_until <= 0
                            ? "Due today"
                            : bill.days_until === 1
                            ? "Due tomorrow"
                            : `In ${bill.days_until} days`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Carousel Navigation Bar */}
        <footer className="pt-4 border-t border-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-600 mb-3">
            <div className="flex items-center gap-4">
              <span className={currentSlide === 0 ? "text-emerald-400 font-medium" : ""}>
                Overview
              </span>
              <span>•</span>
              <span className={currentSlide === 1 ? "text-emerald-400 font-medium" : ""}>
                Cashflow Dynamics
              </span>
              <span>•</span>
              <span className={currentSlide === 2 ? "text-blue-400 font-medium" : ""}>
                Checking
              </span>
              <span>•</span>
              <span className={currentSlide === 3 ? "text-zinc-300 font-medium" : ""}>
                Advisor
              </span>
              <span>•</span>
              <span className={currentSlide === 4 ? "text-purple-400 font-medium" : ""}>
                Obligations
              </span>
            </div>

            <div>20s Cycle · Pure OLED Compliant</div>
          </div>

          <div className="w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
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
        <div className="fixed inset-0 bg-[#000000] text-zinc-600 flex items-center justify-center font-sans">
          Loading Shield TV Ambient Display...
        </div>
      }
    >
      <KioskContent />
    </Suspense>
  );
}
