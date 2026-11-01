package finance

import (
	"math"
	"testing"
	"time"
)

func TestExactExcelCalculations(t *testing.T) {
	// Recreating Gastos Albeiro.xlsx baseline values
	state := FinancialState{
		Accounts: []Account{
			{ID: "1", Name: "Daviplata", Type: AccountWallet, Balance: 2893},
			{ID: "2", Name: "Caja social", Type: AccountWallet, Balance: 43637},
			{ID: "3", Name: "Bolsillo", Type: AccountWallet, Balance: 200000},
			{ID: "4", Name: "Colchon", Type: AccountWallet, Balance: 0},
			{ID: "5", Name: "Nequi", Type: AccountWallet, Balance: 724549},
			{ID: "6", Name: "Fiducia Capital", Type: AccountInvestment, Balance: 30000000},
			{ID: "7", Name: "Crypto", Type: AccountInvestment, Balance: 0, InvestmentMeta: &InvestMeta{Units: 200, FxRate: 3400}}, // 680,000
		},
		RecurringExpenses: []RecurringExpense{
			{ID: "e1", Name: "Merc Aseo", Category: "Hogar", BudgetedAmount: 925000, RemainingAmount: 120000, DueDay: 1},
			{ID: "e2", Name: "Movistar", Category: "Servicios", BudgetedAmount: 60000, RemainingAmount: 25000, DueDay: 26},
			{ID: "e3", Name: "Internet", Category: "Servicios", BudgetedAmount: 15000, RemainingAmount: 0, DueDay: 25, IsPaid: true},
			{ID: "e4", Name: "Gas", Category: "Servicios", BudgetedAmount: 10000, RemainingAmount: 10000, DueDay: 15},
			{ID: "e5", Name: "Energía", Category: "Servicios", BudgetedAmount: 180000, RemainingAmount: 180000, DueDay: 20},
			{ID: "e6", Name: "Agua", Category: "Servicios", BudgetedAmount: 35000, RemainingAmount: 0, DueDay: 25, IsPaid: true},
			{ID: "e7", Name: "Mamá", Category: "Familia", BudgetedAmount: 750000, RemainingAmount: 0, DueDay: 1, IsPaid: true},
			{ID: "e8", Name: "Papá", Category: "Familia", BudgetedAmount: 260000, RemainingAmount: 130000, DueDay: 15},
			{ID: "e9", Name: "Planilla", Category: "Obligaciones", BudgetedAmount: 508000, RemainingAmount: 508000, DueDay: 1},
			{ID: "e10", Name: "Moto", Category: "Transporte", BudgetedAmount: 40000, RemainingAmount: 40000, DueDay: 7},
		},
		Receivables: []Receivable{
			{ID: "r1", TenantName: "Fiducia Yield", Amount: 175000, NetAmount: 175000, DueDay: 1},
			{ID: "r2", TenantName: "Ana 26", Amount: 700000, NetAmount: 700000, DueDay: 26},
			{ID: "r3", TenantName: "Marisol 23", Amount: 950000, Deductions: 45700, NetAmount: 904300, DueDay: 23},
			{ID: "r4", TenantName: "Camila 20", Amount: 500000, Deductions: -27984, NetAmount: 527984, DueDay: 20},
			{ID: "r5", TenantName: "Angelica 1", Amount: 500000, NetAmount: 500000, DueDay: 1},
			{ID: "r6", TenantName: "Odeth 28", Amount: 340000, NetAmount: 340000, DueDay: 28},
		},
		MonthlyExtras: []MonthlyExtra{
			{ID: "x1", Name: "Freelance", Type: "income", RawAmount: 1100000, NetMultiplier: 0.89, NetAmount: 979000},
			{ID: "x2", Name: "Med agua", Type: "expense", RawAmount: 160000, NetMultiplier: 1.0, NetAmount: 160000},
		},
	}

	refDate := time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)
	state.ReferenceDate = &refDate

	report := CalculateFinancialMetrics(state)

	// 1. Total liquid cash check (=SUM(B2:B6) = 971079)
	if math.Round(report.TotalLiquidCash) != 971079 {
		t.Errorf("Expected TotalLiquidCash 971079, got %v", report.TotalLiquidCash)
	}

	// 2. Total pending expenses check (=SUM(G2:G14) = 1013000)
	if math.Round(report.TotalPendingExpenses) != 1013000 {
		t.Errorf("Expected TotalPendingExpenses 1013000, got %v", report.TotalPendingExpenses)
	}

	// 3. Immediate Restante check (=B18 - G18 = -41921)
	if math.Round(report.ImmediateRestante) != -41921 {
		t.Errorf("Expected ImmediateRestante -41921, got %v", report.ImmediateRestante)
	}

	// 4. Receivables sum + Net extras check:
	// Receivables = 175000 + 700000 + 904300 + 527984 + 500000 + 340000 = 3147284
	// Net extras = 979000 - 160000 = 819000
	// Total pending incoming = 3147284 + 819000 = 3966284 (Matches Excel cell B21: 3966284)
	totalPendingIncoming := report.PendingReceivables + report.PendingNetExtras
	if math.Round(totalPendingIncoming) != 3966284 {
		t.Errorf("Expected total pending incoming 3966284, got %v", totalPendingIncoming)
	}

	// 5. Total budgeted expenses check (=SUM(F1:F14) = 2783000)
	if math.Round(report.TotalBudgetedExpenses) != 2783000 {
		t.Errorf("Expected TotalBudgetedExpenses 2783000, got %v", report.TotalBudgetedExpenses)
	}

	// 6. Excel "Incl Pend" check: Restante + PendingIncoming - BudgetedExpenses
	// -41921 + 3966284 - 2783000 = 1141363 (Matches Excel cell B22: 1141363)
	if math.Round(report.NextCycleBuffer) != 1141363 {
		t.Errorf("Expected NextCycleBuffer 1141363, got %v", report.NextCycleBuffer)
	}

	// 7. Total Investments check: 30000000 (Fiducia) + 680000 (Crypto 200*3400) = 30680000
	if math.Round(report.TotalInvestmentCapital) != 30680000 {
		t.Errorf("Expected TotalInvestmentCapital 30680000, got %v", report.TotalInvestmentCapital)
	}
}
