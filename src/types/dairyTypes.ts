export type AnimalType = 'COW' | 'BUFFALO';

// A farmer's registered classification - a farmer can supply BOTH milk types,
// in which case the milk type is chosen per entry instead of being fixed.
export type FarmerAnimalType = 'COW' | 'BUFFALO' | 'BOTH';

// ─── Branch ───────────────────────────────────────────────────────────────────
export interface Branch {
  id?:      number;
  code:     string;   // "B1", "B2"
  name:     string;   // "Pune Dairy"
  isActive?: boolean;
}

// ─── Farmer ───────────────────────────────────────────────────────────────────
export interface Farmer {
  number: string;
  id?:          number;
  branchCode?:  string;    
  farmerNumber: number;
  name:         string;
  phone?:       string;
  animalType:   FarmerAnimalType;
  isActive?:    boolean;
}

// ─── Fat Rate ─────────────────────────────────────────────────────────────────
export interface FatRate {
  id?:           number;
  branchCode?:   string;   
  milkType?:     AnimalType;
  animalType?:   AnimalType;
  snf?: number;       
  fatPercentage: number;
  ratePerLiter:  number;
}

// ─── Milk Entry ───────────────────────────────────────────────────────────────
export interface MilkEntryRequest {
  farmerNumber: number;
  entryDate:    string;
  session:      'MORNING' | 'EVENING';
  animalType:   AnimalType;
  liters:       number;
  fat:          number;
  snf?:         number;
}

export interface MilkEntryResponse {
  id:           number;
  branchCode?:  string;   
  farmerNumber: number;
  farmerName:   string;
  entryDate:    string;
  session:      'MORNING' | 'EVENING';
  animalType?:  AnimalType;
  milkType?:    AnimalType; 
  liters:       number;
  fat:          number;
  ratePerLiter: number;
  amount:       number;
  snf?:         number;
}

// ─── Fat Lookup ───────────────────────────────────────────────────────────────
export interface FatLookupResponse {
  fat:              number;
  milkType?:        AnimalType;
  animalType?:      AnimalType;
  ratePerLiter:     number;
  estimatedAmount?: number;
}

// ─── Ledger (उचल / लागवड / जमा / बाकी) ────────────────────────────────────────
export type LedgerEntryType = 'UCHAL' | 'LAGAVAD' | 'JAMA';

export interface LedgerEntryRequest {
  type:          LedgerEntryType;
  amount:        number;
  entryDate:     string;
  billFromDate?: string;
  billToDate?:   string;
  // For a JAMA entry belonging to a farmer who supplies BOTH cow and buffalo
  // milk: which section (गाय / म्हैस) this जमा should count against in the
  // payment register, instead of being split proportionally.
  milkType?:     AnimalType | 'BOTH';
  note?:         string;
}

export interface LedgerEntryResponse {
  id:            number;
  type:          LedgerEntryType;
  amount:        number;
  entryDate:     string;
  billFromDate?: string;
  billToDate?:   string;
  milkType?:     AnimalType | 'BOTH';
  note?:         string;
  balanceAfter:  number;
}

export interface LedgerResponse {
  farmerNumber:    number;
  farmerName:      string;
  animalType?:     AnimalType;
  currentBalance:  number;
  entries:         LedgerEntryResponse[];
}

// ─── Bill ─────────────────────────────────────────────────────────────────────
export interface BillGenerateRequest {
  fromDate:          string;
  toDate:            string;
  savingPercent?:    number;   
  advanceDeduction?: number;
  otherDeductions?:  number;
}

export interface BillResponse {
  sadilvar: number;
  id:                 number;
  branchCode?:        string;  
  farmerNumber:       number;
  farmerName:         string;
  farmerVillage?:     string;
  fromDate:           string;
  toDate:             string;

  // Session totals
  morningTotalLiters: number;
  morningTotalAmount: number;
  eveningTotalLiters: number;
  eveningTotalAmount: number;

  // Milk type totals
  cowTotalLiters:     number;
  cowTotalAmount:     number;
  buffaloTotalLiters: number;
  buffaloTotalAmount: number;

  // Grand totals
  totalLiters:        number;
  totalAmount:        number;

  // Deductions
  savingPercent:      number;
  savingDeduction:    number;
  advanceDeduction:   number;
  otherDeductions:    number;

  // Net payable
  netAmount:          number;

  isPaid:             boolean;
  entries?:           MilkEntryResponse[];
}