import type { CreateMemberInput, Gender, PaymentMethod, Plan } from './types';
import { addMonths, todayIso } from './format';
import { normalizeMemberPhone } from './member-phone';

export const MEMBER_CSV_HEADER = 'name,phone,gender,plan_name,start_date,paid_amount,payment_method,discount,admission_fee,email,address,notes\r\n';
export const MAX_IMPORT_BYTES = 1_000_000;
const MAX_ROWS = 500;
const METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank transfer'];
const GENDERS: Gender[] = ['Male', 'Female', 'Other'];

export type ImportRow = { rowNumber: number; input: CreateMemberInput; planName: string; endDate: string; total: number; due: number };
export type MemberImportPreview = {
  rows: ImportRow[];
  errors: string[];
  canImport: boolean;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
};

/** A small strict RFC-style reader. Quoted fields may contain newlines and escaped quotes. */
function readCsv(text: string): string[][] {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('Choose a CSV smaller than 1 MB.');
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const pushField = () => { row.push(field.trim()); field = ''; closed = false; };
  const pushRow = () => {
    pushField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error('Import up to 500 members at a time.');
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === ',') pushField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      pushRow();
    } else if (ch === '"') {
      if (field || closed) throw new Error('Invalid CSV quote. Put quotes around the whole field.');
      quoted = true;
    } else {
      if (closed && ch.trim()) throw new Error('Unexpected text after a quoted CSV field.');
      if (!closed) field += ch;
    }
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  if (field || closed || row.length) pushRow();
  return rows;
}

function phoneNumber(value: string) {
  return normalizeMemberPhone(value);
}

function money(value: string, label: string) {
  if (!value) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label} must be a non-negative rupee amount with up to two decimals.`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount > 10_000_000) throw new Error(`${label} is too large.`);
  return amount;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function previewMemberImport(csv: string, plans: Plan[], existingPhones: string[]): MemberImportPreview {
  const preview: MemberImportPreview = { rows: [], errors: [], canImport: false, totalBilled: 0, totalPaid: 0, totalDue: 0 };
  try {
    const records = readCsv(csv);
    const headers = records.shift()?.map((value) => value.toLowerCase()) ?? [];
    const allowed = MEMBER_CSV_HEADER.trim().split(',');
    if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
    const missing = ['name', 'phone', 'plan_name', 'start_date', 'paid_amount', 'payment_method'].filter((key) => !headers.includes(key));
    if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(', ')}. Use the provided template.`);
    const unknown = headers.filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Unknown CSV columns: ${unknown.join(', ')}. Use the provided template.`);
    if (!records.length) throw new Error('The CSV has no members. Fill in the template before importing.');
    const seen = new Set<string>();
    const existing = new Set(existingPhones.map((phone) => {
      try { return phoneNumber(phone); } catch { return phone; }
    }));
    records.forEach((record, index) => {
      const rowNumber = index + 2;
      try {
        if (record.length !== headers.length) throw new Error(`expected ${headers.length} columns; found ${record.length}.`);
        const values = Object.fromEntries(headers.map((key, i) => [key, record[i]]));
        if (!values.name?.trim()) throw new Error('name is required.');
        const phone = phoneNumber(values.phone);
        const repeated = seen.has(phone);
        seen.add(phone);
        if (repeated) throw new Error(`phone ${phone} is repeated in this CSV.`);
        if (existing.has(phone)) throw new Error(`phone ${phone} already exists on this device.`);
        const matching = plans.filter((plan) => plan.active === 1 && plan.name.trim().toLowerCase() === values.plan_name.toLowerCase());
        if (matching.length !== 1) throw new Error(`plan "${values.plan_name}" must match exactly one active plan. Create or rename plans in Your gym first.`);
        const plan = matching[0];
        if (!validDate(values.start_date)) throw new Error('start_date must be a real date in YYYY-MM-DD format.');
        const gender = GENDERS.find((item) => item.toLowerCase() === (values.gender || 'Other').toLowerCase());
        if (!gender) throw new Error('gender must be Male, Female or Other.');
        const method = METHODS.find((item) => item.toLowerCase() === (values.payment_method || 'Cash').toLowerCase());
        if (!method) throw new Error('payment_method must be Cash, UPI, Card or Bank transfer.');
        const discount = money(values.discount ?? '', 'discount');
        const admissionFee = money(values.admission_fee ?? '', 'admission_fee');
        const initialPayment = money(values.paid_amount, 'paid_amount');
        if (initialPayment > 0 && values.start_date > todayIso()) throw new Error('paid_amount cannot be recorded on a future start_date. Import with zero paid, then record the payment on its actual date.');
        if (discount > plan.amount) throw new Error('discount cannot exceed the plan price.');
        const total = Math.round((plan.amount - discount + admissionFee) * 100) / 100;
        if (initialPayment > total) throw new Error('paid_amount cannot exceed the total after discount and admission fee.');
        const due = Math.round((total - initialPayment) * 100) / 100;
        const input: CreateMemberInput = {
          name: values.name, phone, gender, planId: plan.id, joiningDate: values.start_date,
          discountAmount: discount, admissionFee, initialPayment, paymentMethod: method, paymentDate: values.start_date,
          email: values.email, address: values.address, notes: values.notes,
        };
        preview.rows.push({ rowNumber, input, planName: plan.name, endDate: addMonths(values.start_date, plan.duration_months), total, due });
      } catch (error) {
        preview.errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Invalid member data.'}`);
      }
    });
    preview.totalBilled = Math.round(preview.rows.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
    preview.totalPaid = Math.round(preview.rows.reduce((sum, row) => sum + row.input.initialPayment, 0) * 100) / 100;
    preview.totalDue = Math.round(preview.rows.reduce((sum, row) => sum + row.due, 0) * 100) / 100;
    preview.canImport = preview.errors.length === 0 && preview.rows.length > 0;
  } catch (error) {
    preview.errors.push(error instanceof Error ? error.message : 'Could not read this CSV.');
  }
  return preview;
}
