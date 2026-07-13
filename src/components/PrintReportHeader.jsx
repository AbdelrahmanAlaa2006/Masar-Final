import React from 'react'
import { useTenant } from '../contexts/TenantContext'

/* Print-only report header.

   Renders the current tenant's (platform's) name at the very top of a printed
   report. Hidden on screen, shown only when printing — so every tenant's
   printout carries its OWN name, reliably, even if the user has turned off the
   browser's "Headers and footers" print option (which is where the generic
   document.title would otherwise appear).

   Drop it as the first child inside the report's `.cp-table-card` print target.
   Pass an optional `subtitle` (e.g. the report's name) shown under the name. */
export default function PrintReportHeader({ subtitle }) {
  const { tenant, tenantName } = useTenant()
  const name = tenantName || tenant?.name || ''
  if (!name) return null

  return (
    <div className="print-report-header" aria-hidden="true">
      <style>{`
        .print-report-header { display: none; }
        @media print {
          .print-report-header {
            display: block !important;
            text-align: center;
            margin: 0 0 14px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000000;
          }
          .print-report-header .prh-name {
            font-size: 18pt;
            font-weight: 800;
            color: #000000;
            line-height: 1.2;
          }
          .print-report-header .prh-sub {
            font-size: 10pt;
            color: #444444;
            margin-top: 4px;
          }
        }
      `}</style>
      <div className="prh-name">{name}</div>
      {subtitle && <div className="prh-sub">{subtitle}</div>}
    </div>
  )
}
