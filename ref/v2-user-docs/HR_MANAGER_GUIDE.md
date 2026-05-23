# TaoLink HRIS: Comprehensive Guide for HR Managers

Welcome to **TaoLink HRIS**, the modern, Philippine-compliant Human Resource Information System and Payroll platform. This guide is specifically designed for HR Managers and Administrators to help you seamlessly manage employees, process payroll, and ensure statutory compliance.

---

## Table of Contents
1. [Dashboard Overview](#1-dashboard-overview)
2. [Employee Management (201 Records)](#2-employee-management-201-records)
3. [Attendance Tracking](#3-attendance-tracking)
4. [Leave Management](#4-leave-management)
5. [Loan Management](#5-loan-management)
6. [Payroll Processing (Pay Runs)](#6-payroll-processing-pay-runs)
7. [13th Month Pay](#7-13th-month-pay)
8. [Remittances & Compliance](#8-remittances--compliance)
9. [System Settings & Audit Logs](#9-system-settings--audit-logs)

---

## 1. Dashboard Overview
The **Dashboard** is your command center. When you log in, you will immediately see high-level metrics and actionable items that require your attention.

- **Headcount Overview**: Quick count of active and inactive employees.
- **Pending Actions**: Immediate alerts for pending Leave Requests, Loan Applications, or unresolved Attendance issues.
- **Upcoming Payroll**: Dates and statuses of the next scheduled pay run.

**HR Action:** Start your day here to clear pending requests before jumping into other modules.

---

## 2. Employee Management (201 Records)
The **Employees** module serves as the digital 201 file for your entire workforce.

### Adding a New Employee
1. Navigate to **Employees** in the sidebar.
2. Click the **+ Add New Employee** button.
3. Complete the required sections:
   - **Personal Info**: Full name, birth date, gender, and contact details.
   - **Address**: Current residential details.
   - **Bank Details**: Exact bank name and account number (critical for payroll disbursement).
   - **Employment Info**: Hire date, base salary, pay frequency (e.g., semi-monthly), and employment status.
   - **Statutory Details**: SSS, PhilHealth, Pag-IBIG, and TIN numbers. Toggle contribution deductions as needed.
4. Click **Save** to create the employee's payroll profile.

> **ESS Portal Access:** To let the new hire log into the Employee Self-Service portal, head to **Settings → Accounts** afterward and link an auth account to their employee record. The Save step above creates the payroll record only.

### Managing Employee Profiles
- Click any employee in the list to view their full profile.
- You can update their salary, shift schedules, or personal details at any time. *(Note: Changes to salary apply to the next generated pay run).*

---

## 3. Attendance Tracking
The **Attendance** module captures daily time-in/time-out records.

- **Daily Logs**: View exactly when employees clocked in and out.
- **Missing Punches**: Identify and correct logs where an employee forgot to clock out.
- **Overtime & Lates**: The system automatically calculates tardiness and undertime based on the employee's assigned shift, directly feeding this data into the upcoming payroll.

---

## 4. Leave Management
Employees apply for leaves via their Employee Self-Service (ESS) portal. As an HR Manager, you manage these requests in the **Leaves** module.

### Approving/Rejecting Leaves
1. Go to **Leaves** in the sidebar.
2. Review the list of **Pending** requests. You can see the leave type (Vacation, Sick, etc.), dates requested, and the employee's remaining leave balance.
3. Click on a specific request to view the employee's stated reason.
4. Click **Approve** or **Reject**. 
   - *Approved leaves are automatically factored into payroll (if paid) and the employee's balance is deducted.*
   - *Employees are immediately notified of the decision in their ESS portal.*

---

## 5. Loan Management
Manage company loans, cash advances, or government loan deductions (e.g., SSS Salary Loan, Pag-IBIG Calamity Loan) via the **Loans** module.

### Adding a Loan/Deduction
1. Navigate to **Loans** and click **+ Add Loan**.
2. Select the **Employee** and the **Loan Type** (e.g., Company Cash Advance).
3. Enter the **Principal Amount** and the **Amortization** (the amount to deduct per pay period).
4. **Active Tracking**: The system will automatically deduct the scheduled amount during each pay run until the principal balance reaches zero.

---

## 6. Payroll Processing (Pay Runs)
The core of TaoLink. The **Pay Runs** module automates computation based on attendance, leaves, loans, and statutory deductions.

### Step-by-Step: Running Payroll
1. Go to **Pay Runs** and click **Generate Pay Run**.
2. Select the **Pay Period** (e.g., Nov 16 - Nov 30).
3. **Draft Stage**: The system calculates Gross Pay, subtracts lates/undertime, applies loan amortizations, and calculates exact SSS/PhilHealth/Pag-IBIG/Tax deductions based on government brackets.
4. **Reviewing the Summary**: Visit **Payroll Summary** to confirm the Executive Summary (Total Gross Labor Cost, Net Payout, Statutory Totals).
5. **Finalizing**: Once reviewed, click **Finalize**. This locks the data and releases the digital payslips to the employees' ESS portals.

*Note: If an error is spotted after finalization, you can **Void** the payroll. The system safely reverses loan payments and restores leave balances.*

---

## 7. 13th Month Pay
TaoLink automates the computation of the mandated 13th-month bonus based on the employee's basic salary earned throughout the year.

1. Navigate to **13th Month**.
2. Select the target year. The system lists all eligible employees and their prorated/full calculated bonus.
3. You can generate a dedicated 13th-month payout file, separating it from standard payroll to prevent excessive taxation routing issues.

---

## 8. Remittances & Compliance
Say goodbye to manual Excel calculations for government reports.

- Navigate to **Remittances**.
- Select the reporting month.
- The system generates aggregated totals for **Employer (ER)** and **Employee (EE)** shares for:
  - SSS
  - PhilHealth
  - Pag-IBIG
  - Withholding Tax
- **Generate Reports**: Use these figures to fill out government remittance forms or upload the generated files directly to the respective portal.

---

## 9. System Settings & Audit Logs
Maintain the technical and security integrity of your HRIS.

### Settings
- **Company Profile**: Update company name and contact info.
- **Government Rates**: Authorized administrators can update calculation brackets if the government mandates a change to SSS or PhilHealth rates.
- **Maintenance Mode**: Toggle this on during critical updates to temporarily block employee access to the ESS portal.

### Audit Logs
- Navigate to **Audit Logs**.
- Every critical action (e.g., updating a salary, approving a leave, voiding a payroll) is permanently recorded. 
- You can trace *who* made the change, *when* it was made, and *what* the old/new values were to ensure maximum accountability.

---

*Need immediate assistance? Please contact your System Administrator or refer to the platform's API documentation for deeper technical guidance.*
