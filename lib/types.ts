export type Gender = 'Male' | 'Female' | 'Other';
export type MemberStatus = 'active' | 'blocked' | 'archived';
export type MembershipStatus = 'active' | 'expired' | 'frozen' | 'cancelled';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank transfer';

export type Plan = {
  id: number;
  name: string;
  duration_months: number;
  amount: number;
  active: number;
};

export type Expense = {
  id: number;
  title: string;
  amount: number;
  expense_date: string;
  category: string;
  notes: string | null;
  created_at: string;
};

export type MemberListItem = {
  id: number;
  membership_id: string;
  name: string;
  gender: Gender;
  phone: string;
  photo_uri: string | null;
  status: MemberStatus;
  joined_at: string;
  plan_name: string | null;
  membership_status: MembershipStatus | null;
  end_date: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  attended_today: number;
};

export type Payment = {
  id: number;
  member_id: number;
  membership_id: number;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export type MemberDetail = MemberListItem & {
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  membership_row_id: number | null;
  start_date: string | null;
  base_amount: number;
  discount_amount: number;
  admission_fee: number;
  membership_status: MembershipStatus | null;
  payments: Payment[];
  attendance_count: number;
};

export type DashboardStats = {
  activeMembers: number;
  totalMembers: number;
  expiringSoon: number;
  presentToday: number;
  collectedThisMonth: number;
  outstandingDue: number;
  recentMembers: MemberListItem[];
  expiringMembers: MemberListItem[];
  weeklyAttendance: { label: string; count: number }[];
};

export type ReportData = {
  activeMembers: number;
  totalBilled: number;
  totalCollected: number;
  totalDue: number;
  collectedThisMonth: number;
  expensesThisMonth: number;
  netThisMonth: number;
  monthlyCollection: { label: string; amount: number }[];
  paymentMethods: { method: string; amount: number }[];
  recentPayments: (Payment & { member_name: string })[];
  recentExpenses: Expense[];
};

export type GymProfile = {
  gymName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
};

export type CreateMemberInput = {
  name: string;
  gender: Gender;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  photoUri?: string;
  planId: number;
  joiningDate: string;
  discountAmount: number;
  admissionFee: number;
  initialPayment: number;
  paymentMethod: PaymentMethod;
};

export type UpdateMemberInput = {
  name: string;
  gender: Gender;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  photoUri?: string;
  joinedAt: string;
};

export type CreateMembershipInput = {
  memberId: number;
  planId: number;
  joiningDate: string;
  discountAmount: number;
  admissionFee: number;
  initialPayment: number;
  paymentMethod: PaymentMethod;
};
