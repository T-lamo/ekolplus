// Client-side response shapes of the /api/admin SaaS routes (Epic 2) —
// shared by the admin pages so the dashboard's school rows and
// /admin/schools' rows can never drift apart.

export interface AdminSchoolRow {
  id: string;
  organizationId: string;
  name: string;
  officialCode: string | null;
  country: string;
  city: string;
  ownerName: string;
  plan: { key: string; name: string } | null;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELED' | 'NONE';
  expiringSoon: boolean;
  students: number;
  users: number;
  monthlyCents: number | null;
  renewsAt: string | null;
  createdAt: string;
  lastAccessAt: string | null;
}

export interface AdminCouponSummary {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_MONTH';
  value: number;
  durationMonths: number | null;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXHAUSTED' | 'EXPIRED' | 'INACTIVE';
}

export interface AdminOverviewResponse {
  kpis: {
    totalSchools: number;
    schoolsDeltaMonth: number;
    totalUsers: number;
    usersDeltaMonth: number;
    activeUsers: number;
    activeUsersPct: number;
    activeSubscriptions: number;
    expiringSoon: number;
    monthRevenueCents: number;
    revenueDeltaPct: number | null;
  };
  revenue: {
    series: { label: string; cents: number }[];
    totalCents: number;
    avgCents: number;
    growthPct: number | null;
  };
  recentUsers: {
    id: string;
    name: string;
    schoolName: string | null;
    orgRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
    status: 'ACTIVE' | 'SUSPENDED';
    lastLoginAt: string | null;
    createdAt: string;
  }[];
  schools: AdminSchoolRow[];
  recentTransactions: {
    id: string;
    schoolName: string;
    planName: string | null;
    students: number;
    amountCents: number;
    paidAt: string;
    status: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  }[];
  coupons: AdminCouponSummary[];
}
