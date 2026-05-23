# TaoLink: User Guide

Welcome to **TaoLink**, a modern, PH-compliant HRIS and Payroll system. This guide covers the essential workflows for administrators and employees.

---

## 🔐 Authentication & Roles
The system supports three main roles:
- **SUPER_ADMIN**: Full access to all settings, compliance rates, and audit logs.
- **HR_ADMIN**: Access to employee management, payroll processing, and leave approvals.
- **MANAGER**: Access to view payroll summaries and employee profiles.
- **EMPLOYEE**: Access to the Employee Self-Service (ESS) portal.

---

## 👥 Employee Management (201 Records)
### Onboarding a New Employee
1. Navigate to **Employee Management**.
2. Click **+ Add New Employee**.
3. Complete the multi-step form:
   - **Personal Info**: Name, Birth Date, Gender, etc.
   - **Address**: Current residential details.
   - **Bank Details**: Required for payroll disbursement.
   - **Employment**: Salary, Pay Frequency, and Contribution Toggles (SSS, PH, PB, Tax).

### Updating Profiles
- Click an employee's name in the list to view their full 201 profile.
- Use the **Edit Profile** button (coming soon) to update records.

---

## 💰 Payroll Processing
### running a Pay Run
1. Access the **Payroll Summary** dashboard.
2. Select a **Pay Period** from the dropdown.
3. Review the **Executive Summary** including Gross Labor Cost and Net Pay.
4. Verify the **Statutory & Compliance** section to ensure EE/ER shares are correct.

---

## 🏖️ Leave Management
### For Employees (Applying)
1. Log into the **ESS Portal**.
2. Go to **Leaves** -> **Apply for Leave**.
3. Select Leave Type (Vacation, Sick, Emergency, etc.) and dates.
4. Provide a reason and submit.

### For Admins (Approving)
1. Navigate to **Leave Approvals** in the sidebar.
2. Review pending requests.
3. Click **Approve** or **Reject**.
4. Actions are immediately reflected in the employee's portal and logged in the **Audit Trail**.

---

## 🏛️ Compliance & Reporting
### Government Remittances
- Use the **Remittances Dashboard** to view monthly company-wide liabilities.
- Export summaries for **SSS**, **PhilHealth**, and **Pag-IBIG** payments.

### Modifying Rates
- Authorized Super Admins can update statutory brackets at **System Settings** -> **Government Rates**.

---

## 🛠️ System Settings
- Manage the **Company Name** and **Maintenance Mode** in the **System Settings** module.
- Maintenance Mode prevents employee access during critical updates.

---

*For technical support, contact the system administrator or refer to the API Documentation.*
