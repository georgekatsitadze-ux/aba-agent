// src/lib/api.ts
import axios, { AxiosInstance } from "axios";
export const API_BASE = import.meta.env.DEV ? "" : "http://localhost:3001";
const baseURL = import.meta.env.DEV ? "/api" : `${API_BASE}/api`;
const api: AxiosInstance = axios.create({ baseURL, headers: { "Content-Type": "application/json" } });
export default api;
