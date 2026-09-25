import axios from 'axios';
import type {
  Branch, Farmer, FatRate, MilkEntryRequest, MilkEntryResponse,
  FatLookupResponse, BillResponse, BillGenerateRequest, AnimalType,
  LedgerEntryRequest, LedgerResponse, LagwadType
} from '../types/dairyTypes';

const api = axios.create({
 baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8082/api',
  headers: { 'Content-Type': 'application/json' },
});

const normalizeMilkEntry = (e: any): MilkEntryResponse => ({
  ...e,
  animalType: (e.animalType ?? e.milkType ?? 'COW') as AnimalType,
});

const normalizeBill = (b: any): BillResponse => ({
  ...b,
  savingPercent:   b.savingPercent   ?? 3,
  savingDeduction: b.savingDeduction ?? 0,
});

export const branchAPI = {
  getAll: () =>
    api.get<Branch[]>('/branches').then(r => r.data),
  create: (data: Branch) =>
    api.post<Branch>('/branches', data).then(r => r.data),
  update: (id: number, data: Branch) =>
    api.put<Branch>(`/branches/${id}`, data).then(r => r.data),
};

export const farmerAPI = {
  getAll: (branchCode: string) =>
    api.get<Farmer[]>(`/${branchCode}/farmers`).then(r => r.data),
  getByNumber: (branchCode: string, num: number) =>
    api.get<Farmer>(`/${branchCode}/farmers/${num}`).then(r => r.data),
  create: (branchCode: string, data: Farmer) =>
    api.post<Farmer>(`/${branchCode}/farmers`, data).then(r => r.data),
  update: (branchCode: string, id: number, data: Farmer) =>
    api.put<Farmer>(`/${branchCode}/farmers/${id}`, data).then(r => r.data),
  search: (branchCode: string, q: string) =>
    api.get<Farmer[]>(`/${branchCode}/farmers/search?q=${q}`).then(r => r.data),
  // Soft delete — sets isActive = false
  delete: (branchCode: string, farmerNumber: number) =>
    api.delete<Farmer>(`/${branchCode}/farmers/${farmerNumber}`).then(r => r.data),
};

export const fatRateAPI = {
  getAll: (branchCode: string) =>
    api.get<FatRate[]>(`/${branchCode}/fat-rates`).then(r => r.data),

  getByAnimalType: (branchCode: string, animalType: AnimalType) =>
    api.get<FatRate[]>(`/${branchCode}/fat-rates/by-type`, {
      params: { milkType: animalType },
    }).then(r => r.data),

  save: (branchCode: string, data: { animalType: AnimalType; fatPercentage: number; snf?: number; ratePerLiter: number }) =>
    api.post<FatRate>(`/${branchCode}/fat-rates`, {
      fatPercentage: data.fatPercentage,
      snf:           data.snf ?? null,
      ratePerLiter:  data.ratePerLiter,
      milkType:      data.animalType,
    }).then(r => r.data),

  update: (branchCode: string, id: number, data: { animalType: AnimalType; fatPercentage: number; snf?: number; ratePerLiter: number }) =>
    api.put<FatRate>(`/${branchCode}/fat-rates/${id}`, {
      fatPercentage: data.fatPercentage,
      snf:           data.snf ?? null,
      ratePerLiter:  data.ratePerLiter,
      milkType:      data.animalType,
    }).then(r => r.data),

  delete: (branchCode: string, id: number) =>
    api.delete(`/${branchCode}/fat-rates/${id}`),

  lookup: (branchCode: string, fat: number, animalType: AnimalType, liters?: number, snf?: number) =>
    api.post<FatLookupResponse>(`/${branchCode}/fat-rates/lookup`, {
      fat,
      milkType: animalType,
      snf: snf ?? null,
      ...(liters !== undefined ? { liters } : {}),
    }).then(r => r.data),
};

export const milkEntryAPI = {
  create: (branchCode: string, data: MilkEntryRequest) =>
    api.post<MilkEntryResponse>(`/${branchCode}/entries`, {
      farmerNumber: data.farmerNumber,
      entryDate:    data.entryDate,
      session:      data.session,
      milkType:     data.animalType,
      liters:       data.liters,
      fat:          data.fat,
      snf:          data.snf,
    }).then(r => normalizeMilkEntry(r.data)),

  getByDate: (branchCode: string, date: string) =>
    api.get<MilkEntryResponse[]>(`/${branchCode}/entries/date/${date}`)
      .then(r => r.data.map(normalizeMilkEntry)),

  getByFarmerAndRange: (branchCode: string, num: number, from: string, to: string) =>
    api.get<MilkEntryResponse[]>(`/${branchCode}/entries/farmer/${num}`, {
      params: { from, to },
    }).then(r => r.data.map(normalizeMilkEntry)),

  getByRange: (branchCode: string, from: string, to: string) =>
    api.get<MilkEntryResponse[]>(`/${branchCode}/entries/range`, {
      params: { from, to },
    }).then(r => r.data.map(normalizeMilkEntry)),

  update: (branchCode: string, id: number, data: MilkEntryRequest) =>
    api.put<MilkEntryResponse>(`/${branchCode}/entries/${id}`, {
      farmerNumber: data.farmerNumber,
      entryDate:    data.entryDate,
      session:      data.session,
      milkType:     data.animalType,
      liters:       data.liters,
      fat:          data.fat,
      snf:          data.snf,
    }).then(r => normalizeMilkEntry(r.data)),

  delete: (branchCode: string, id: number) =>
    api.delete(`/${branchCode}/entries/${id}`),

  getYearlyByFarmerId: (branchCode: string, farmerId: number, from: string, to: string) =>
    api.get<MilkEntryResponse[]>(`/${branchCode}/entries/yearly/by-id`, {
      params: { farmerId, from, to },
    }).then(r => r.data.map(normalizeMilkEntry)),

  getYearlyByFarmerNumber: (branchCode: string, farmerNumber: number, from: string, to: string) =>
    api.get<MilkEntryResponse[]>(`/${branchCode}/entries/yearly`, {
      params: { farmerNumber, from, to },
    }).then(r => r.data.map(normalizeMilkEntry)),
};

export const billAPI = {
  generate: (branchCode: string, data: BillGenerateRequest) =>
    api.post<BillResponse[]>(`/${branchCode}/bills/generate`, {
      ...data,
      savingPercent: data.savingPercent ?? 3,
    }).then(r => r.data.map(normalizeBill)),

  generateForFarmer: (branchCode: string, num: number, data: BillGenerateRequest) =>
    api.post<BillResponse>(`/${branchCode}/bills/generate/${num}`, {
      ...data,
      savingPercent: data.savingPercent ?? 3,
    }).then(r => normalizeBill(r.data)),

  getForFarmer: (branchCode: string, num: number) =>
    api.get<BillResponse[]>(`/${branchCode}/bills/farmer/${num}`)
      .then(r => r.data.map(normalizeBill)),

  getByRange: (branchCode: string, from: string, to: string) =>
    api.get<BillResponse[]>(`/${branchCode}/bills/range`, {
      params: { from, to },
    }).then(r => r.data.map(normalizeBill)),

  markPaid: (id: number) =>
    api.patch<BillResponse>(`/bills/${id}/paid`)
      .then(r => normalizeBill(r.data)),
};

export const ledgerAPI = {
  get: (branchCode: string, farmerNumber: number) =>
    api.get<LedgerResponse>(`/${branchCode}/ledger/${farmerNumber}`).then(r => r.data),

  addEntry: (branchCode: string, farmerNumber: number, data: LedgerEntryRequest) =>
    api.post<LedgerResponse>(`/${branchCode}/ledger/${farmerNumber}`, data).then(r => r.data),

  deleteEntry: (branchCode: string, farmerNumber: number, entryId: number) =>
    api.delete<LedgerResponse>(`/${branchCode}/ledger/${farmerNumber}/${entryId}`).then(r => r.data),

  lookupBill: (branchCode: string, farmerNumber: number, from: string, to: string) =>
    api.get<BillResponse>(`/${branchCode}/ledger/${farmerNumber}/bill-lookup`, {
      params: { from, to },
    }).then(r => r.data),
};

export const lagwadTypeAPI = {
  getAll: (branchCode: string) =>
    api.get<LagwadType[]>(`/${branchCode}/lagwad-types`).then(r => r.data),

  create: (branchCode: string, data: LagwadType) =>
    api.post<LagwadType>(`/${branchCode}/lagwad-types`, data).then(r => r.data),

  update: (branchCode: string, id: number, data: LagwadType) =>
    api.put<LagwadType>(`/${branchCode}/lagwad-types/${id}`, data).then(r => r.data),

  delete: (branchCode: string, id: number) =>
    api.delete(`/${branchCode}/lagwad-types/${id}`),
};

export default api;