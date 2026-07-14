import { supabase } from './supabase'

/* TEMPORARY: auto-filed diagnostic reports for failed attendance scans.
   Fire-and-forget — a failure to save the report must never disturb the
   attendance workflow. The developer reads reports remotely:
     select created_at, report from scanner_diagnostics
     order by created_at desc limit 5;  */
export async function submitScannerDiagnostic({ report, rawInput, finalLookupValue, createdBy }) {
  try {
    await supabase.from('scanner_diagnostics').insert({
      report: String(report || '').slice(0, 20000),
      raw_input: String(rawInput || '').slice(0, 500),
      final_lookup_value: String(finalLookupValue || '').slice(0, 500),
      created_by: createdBy || null,
    })
    return true
  } catch (err) {
    console.error('scanner diagnostic upload failed:', err)
    return false
  }
}
