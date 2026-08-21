import * as fs from "node:fs";
import * as path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Workflow } from "@ba/shared";

export type Row = Record<string, string>;

/** Parse csv/xlsx/json into uniform rows keyed by header names. */
export function parseDataFile(filePath: string): Row[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv" || ext === ".txt") {
    const text = fs.readFileSync(filePath, "utf8");
    const result = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0) {
      const first = result.errors[0]!;
      throw new Error(`CSV parse error at row ${first.row}: ${first.message}`);
    }
    return result.data;
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(fs.readFileSync(filePath));
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Workbook has no sheets");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
      defval: "",
    });
    return rows.map((r) => {
      const out: Row = {};
      for (const [k, v] of Object.entries(r)) out[k] = String(v);
      return out;
    });
  }
  if (ext === ".json") {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(data)) throw new Error("JSON data file must be an array of objects");
    return data.map((r: Record<string, unknown>) => {
      const out: Row = {};
      for (const [k, v] of Object.entries(r)) out[k] = String(v);
      return out;
    });
  }
  throw new Error(`Unsupported data file type: ${ext}`);
}

/**
 * Map a data row onto workflow input variables using each input's
 * "column:<Header>" source. Zero-token manual mapping path.
 */
export function mapRowToVars(workflow: Workflow, row: Row): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const input of workflow.inputs) {
    if (input.source.startsWith("column:")) {
      const col = input.source.slice("column:".length);
      const val = row[col];
      if (val === undefined || val === "") {
        if (input.required) {
          throw new Error(`Row is missing required column "${col}" (input ${input.name})`);
        }
        continue;
      }
      vars[input.name] = val;
    } else if (input.source.startsWith("constant:")) {
      vars[input.name] = input.source.slice("constant:".length);
    }
  }
  return vars;
}
