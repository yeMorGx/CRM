"use client"

import { Badge } from "@/components/reui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Lead, LeadStatus } from "@/lib/crm-types"

type LeadsTableProps = {
  leads: Lead[]
  onSelect: (lead: Lead) => void
  statusLabel: (status: LeadStatus) => string
}

function formatDate(date?: string) {
  if (!date) return "—"

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return "—"

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate)
}

function getWebsiteUrl(website?: string | null) {
  if (!website?.trim()) return null

  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function WebsiteLink({ website }: { website?: string | null }) {
  const url = getWebsiteUrl(website)
  if (!url) return <>—</>

  return (
    <a
      className="lead-table-link"
      href={url.href}
      target="_blank"
      rel="noreferrer"
      title={url.href}
      onClick={(event) => event.stopPropagation()}
    >
      {url.hostname.replace(/^www\./, "")}
    </a>
  )
}

export function LeadsTable({ leads, onSelect, statusLabel }: LeadsTableProps) {
  return (
    <div className="lead-table-wrap">
      <Table className="leads-table">
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Localização</TableHead>
            <TableHead>Estágio</TableHead>
            <TableHead>Atualizado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length ? (
            leads.map((lead) => (
              <TableRow
                key={lead.id}
                className="lead-table-row"
                tabIndex={0}
                aria-label={`Abrir detalhes de ${lead.name}`}
                onClick={() => onSelect(lead)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(lead)
                  }
                }}
              >
                <TableCell>
                  <div className="table-name">
                    <div className="lead-table-company-copy">
                      <strong>{lead.name}</strong>
                      {lead.website ? <span><WebsiteLink website={lead.website} /></span> : <span>Cadastrado em {formatDate(lead.created_at)}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="lead-table-contact">
                    {lead.phone ? <a className="lead-table-link" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} onClick={(event) => event.stopPropagation()}>{lead.phone}</a> : <span>Sem telefone</span>}
                    {lead.email && <a className="lead-table-email" href={`mailto:${lead.email}`} onClick={(event) => event.stopPropagation()}>{lead.email}</a>}
                  </div>
                </TableCell>
                <TableCell className="lead-table-location">
                  {lead.address || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    size="sm"
                    className={`lead-status-badge status-${lead.status}`}
                  >
                    {statusLabel(lead.status)}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(lead.updated_at ?? lead.created_at)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="lead-table-empty">
                <strong>Nenhum lead encontrado</strong>
                <span>Adicione um lead ou ajuste a busca e o filtro.</span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
