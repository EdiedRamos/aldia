'use client'

import { useState } from 'react'
import {
  AlertTriangleIcon,
  BanknoteIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SearchIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { EnrichedContact } from '@/features/contacts/application/get-contacts.use-case'
import type {
  EnrichedLoan,
  LoansBoard,
} from '@/features/loans/application/get-loans-board.use-case'
import { formatCurrency } from '@/features/loans/domain/loan.entity'
import { resolveLoanReceiptTypeFromPath } from '@/features/loans/domain/loan.policy'
import type { WhatsAppMessageTemplates } from '@/features/loans/domain/loan-whatsapp-template'
import { getLoanReceiptPreviewAction } from '@/features/loans/presentation/actions/loan.actions'
import {
  AttachLoanReceiptDialog,
  type LoanReceiptAttachTarget,
} from '@/features/loans/presentation/components/attach-loan-receipt-dialog'
import { LoanCard } from '@/features/loans/presentation/components/loan-card'
import { LoanDetailSheet } from '@/features/loans/presentation/components/loan-detail-sheet'
import { LoanFormSheet } from '@/features/loans/presentation/components/loan-form-sheet'
import { LoanPaymentSheet } from '@/features/loans/presentation/components/loan-payment-sheet'
import { RefinanceLoanSheet } from '@/features/loans/presentation/components/refinance-loan-sheet'
import { WhatsAppTemplatesDialog } from '@/features/loans/presentation/components/whatsapp-templates-dialog'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'

type LoanFilterTab =
  'ACTIVE' | 'OVERDUE' | 'OPEN_ENDED' | 'PAID' | 'REFINANCED' | 'ARCHIVED'

interface LoansBoardViewProps {
  board: LoansBoard
  contacts: EnrichedContact[]
  whatsAppTemplates: WhatsAppMessageTemplates
}

interface ReceiptPreviewState {
  open: boolean
  title: string
  subtitle?: string
  previewUrl: string | null
  fileType?: string
  fileName?: string
  isLoading: boolean
  errorMessage: string | null
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesLoanSearch(loan: EnrichedLoan, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query.trim())
  if (!normalizedQuery) {
    return true
  }

  const digitsQuery = normalizedQuery.replace(/\D/g, '')

  if (normalizeForSearch(loan.contact.name).includes(normalizedQuery)) {
    return true
  }

  if (loan.contact.phone) {
    const phoneLower = loan.contact.phone.toLowerCase()
    if (
      phoneLower.includes(normalizedQuery) ||
      (digitsQuery.length > 0 &&
        phoneLower.replace(/\D/g, '').includes(digitsQuery))
    ) {
      return true
    }
  }

  if (loan.guarantorContact) {
    if (
      normalizeForSearch(loan.guarantorContact.name).includes(normalizedQuery)
    ) {
      return true
    }
    if (loan.guarantorContact.phone) {
      const guarantorPhone = loan.guarantorContact.phone.toLowerCase()
      if (
        guarantorPhone.includes(normalizedQuery) ||
        (digitsQuery.length > 0 &&
          guarantorPhone.replace(/\D/g, '').includes(digitsQuery))
      ) {
        return true
      }
    }
  }

  return false
}

function matchesFilterTab(loan: EnrichedLoan, tab: LoanFilterTab): boolean {
  switch (tab) {
    case 'ACTIVE':
      return loan.status === 'ACTIVE'
    case 'OVERDUE':
      return loan.effectiveStatus === 'OVERDUE'
    case 'OPEN_ENDED':
      return loan.status === 'ACTIVE' && loan.interestModel === 'OPEN_ENDED'
    case 'PAID':
      return loan.status === 'PAID'
    case 'REFINANCED':
      return loan.status === 'REFINANCED'
    case 'ARCHIVED':
      return loan.status === 'ARCHIVED'
  }
}

export function LoansBoardView({
  board,
  contacts,
  whatsAppTemplates: initialTemplates,
}: LoansBoardViewProps) {
  const [activeTab, setActiveTab] = useState<LoanFilterTab>('ACTIVE')
  const [searchQuery, setSearchQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [whatsAppTemplates, setWhatsAppTemplates] =
    useState<WhatsAppMessageTemplates>(initialTemplates)
  const [paymentLoanId, setPaymentLoanId] = useState<string | null>(null)
  const [detailLoanId, setDetailLoanId] = useState<string | null>(null)
  const [refinanceLoanId, setRefinanceLoanId] = useState<string | null>(null)
  const [attachReceiptTarget, setAttachReceiptTarget] =
    useState<LoanReceiptAttachTarget | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreviewState>({
    open: false,
    title: '',
    previewUrl: null,
    isLoading: false,
    errorMessage: null,
  })

  const { loans, summary } = board

  const filteredLoans = loans.filter(
    (loan) =>
      matchesFilterTab(loan, activeTab) && matchesLoanSearch(loan, searchQuery)
  )

  // Always resolve fresh loan data from server props so updates reflect immediately inside open sheets
  const paymentLoan =
    paymentLoanId !== null
      ? (loans.find((item) => item.id === paymentLoanId) ?? null)
      : null
  const detailLoan =
    detailLoanId !== null
      ? (loans.find((item) => item.id === detailLoanId) ?? null)
      : null
  const refinanceLoan =
    refinanceLoanId !== null
      ? (loans.find((item) => item.id === refinanceLoanId) ?? null)
      : null

  async function handlePreviewReceipt(params: {
    receiptPath: string
    title: string
    subtitle?: string
  }) {
    const fileType = resolveLoanReceiptTypeFromPath(params.receiptPath)
    const fileName = params.receiptPath.split('/').pop() ?? 'comprobante'

    setReceiptPreview({
      open: true,
      title: params.title,
      subtitle: params.subtitle,
      previewUrl: null,
      fileType,
      fileName,
      isLoading: true,
      errorMessage: null,
    })

    const result = await getLoanReceiptPreviewAction(params.receiptPath)

    if (!result.ok) {
      setReceiptPreview((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: result.error,
      }))
      return
    }

    setReceiptPreview((prev) => ({
      ...prev,
      isLoading: false,
      previewUrl: result.url,
      errorMessage: null,
    }))
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* Top KPI summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <WalletIcon className="size-3.5" />
              <span>Capital por cobrar</span>
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.activePrincipalToCollect)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {summary.activeLoansCount}{' '}
              {summary.activeLoansCount === 1
                ? 'préstamo activo'
                : 'préstamos activos'}
            </p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUpIcon className="size-3.5" />
              <span>Intereses proyectados</span>
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.activeInterestToCollect)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Intereses y moras pendientes por cobrar
            </p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <BanknoteIcon className="size-3.5" />
              <span>Total recuperado</span>
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
              {formatCurrency(summary.totalRecovered)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {summary.paidLoansCount}{' '}
              {summary.paidLoansCount === 1
                ? 'préstamo saldado'
                : 'préstamos saldados'}
            </p>
          </CardHeader>
        </Card>

        <Card
          className={
            summary.overdueLoansCount > 0 ? 'border-destructive/40' : undefined
          }
        >
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangleIcon
                className={`size-3.5 ${
                  summary.overdueLoansCount > 0 ? 'text-destructive' : ''
                }`}
              />
              <span>Vencidos</span>
            </CardDescription>
            <div className="flex items-center gap-2">
              <CardTitle
                className={`text-2xl font-semibold tabular-nums ${
                  summary.overdueLoansCount > 0 ? 'text-destructive' : ''
                }`}
              >
                {summary.overdueLoansCount}
              </CardTitle>
              {summary.overdueAmount > 0 && (
                <Badge variant="destructive" className="tabular-nums">
                  {formatCurrency(summary.overdueAmount)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.overdueLoansCount === 0
                ? 'Sin cuotas vencidas al día de hoy'
                : 'Préstamos con cuotas vencidas'}
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Filters & Search bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as LoanFilterTab)}
          >
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="ACTIVE">
                Activos ({summary.activeLoansCount})
              </TabsTrigger>
              <TabsTrigger value="OVERDUE">
                Vencidos ({summary.overdueLoansCount})
              </TabsTrigger>
              <TabsTrigger value="OPEN_ENDED">
                Sin plazo fijo ({summary.openEndedLoansCount})
              </TabsTrigger>
              <TabsTrigger value="PAID">
                Pagados ({summary.paidLoansCount})
              </TabsTrigger>
              <TabsTrigger value="REFINANCED">
                Refinanciados ({summary.refinancedLoansCount})
              </TabsTrigger>
              {summary.archivedLoansCount > 0 && (
                <TabsTrigger value="ARCHIVED">
                  Archivados ({summary.archivedLoansCount})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTemplatesOpen(true)}
            >
              <MessageSquareTextIcon className="size-3.5" />
              <span>Configurar mensajes</span>
            </Button>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <PlusIcon />
              <span>Nuevo Préstamo</span>
            </Button>
          </div>
        </div>

        <div className="relative w-full max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por contacto, teléfono o intermediario..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pr-8 pl-8"
            aria-label="Buscar préstamos"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loans grid / Empty states */}
      {loans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <BanknoteIcon className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-medium">
            Aún no tienes préstamos registrados
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Registra el dinero que has prestado, elige entre cuotas con o sin
            interés o modo sin plazo fijo, y lleva control de abonos y soportes.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="mt-4"
          >
            <PlusIcon />
            <span>Nuevo Préstamo</span>
          </Button>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {searchQuery.trim()
              ? `No encontramos préstamos para "${searchQuery.trim()}" en esta vista.`
              : 'No hay préstamos en esta categoría.'}
          </p>
          {searchQuery.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setSearchQuery('')}
            >
              Limpiar búsqueda
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLoans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              whatsAppTemplates={whatsAppTemplates}
              onRegisterPayment={(target) => setPaymentLoanId(target.id)}
              onViewDetail={(target) => setDetailLoanId(target.id)}
              onRefinance={(target) => setRefinanceLoanId(target.id)}
              onPreviewReceipt={handlePreviewReceipt}
              onAttachReceipt={(target) => setAttachReceiptTarget(target)}
            />
          ))}
        </div>
      )}

      {/* Sheets & Modals */}
      {templatesOpen && (
        <WhatsAppTemplatesDialog
          key={`${whatsAppTemplates.directLoanTemplate.length}-${whatsAppTemplates.thirdPartyLoanTemplate.length}`}
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          initialTemplates={whatsAppTemplates}
          onSaved={setWhatsAppTemplates}
        />
      )}

      {createOpen && (
        <LoanFormSheet
          key="new-loan"
          open={createOpen}
          onOpenChange={setCreateOpen}
          contacts={contacts}
        />
      )}

      {paymentLoan && (
        <LoanPaymentSheet
          key={`pay-${paymentLoan.id}-${paymentLoan.payments.length}`}
          open={Boolean(paymentLoan)}
          onOpenChange={(open) => {
            if (!open) {
              setPaymentLoanId(null)
            }
          }}
          loan={paymentLoan}
        />
      )}

      {detailLoan && (
        <LoanDetailSheet
          key={`detail-${detailLoan.id}`}
          open={Boolean(detailLoan)}
          onOpenChange={(open) => {
            if (!open) {
              setDetailLoanId(null)
            }
          }}
          loan={detailLoan}
          onPreviewReceipt={handlePreviewReceipt}
          onAttachReceipt={(target) => setAttachReceiptTarget(target)}
          onRegisterPayment={(target) => setPaymentLoanId(target.id)}
          onRefinance={(target) => setRefinanceLoanId(target.id)}
        />
      )}

      {refinanceLoan && (
        <RefinanceLoanSheet
          key={`refinance-${refinanceLoan.id}`}
          open={Boolean(refinanceLoan)}
          onOpenChange={(open) => {
            if (!open) {
              setRefinanceLoanId(null)
            }
          }}
          loan={refinanceLoan}
        />
      )}

      {attachReceiptTarget && (
        <AttachLoanReceiptDialog
          key={
            attachReceiptTarget.kind === 'disbursement'
              ? `attach-disb-${attachReceiptTarget.loanId}`
              : `attach-pay-${attachReceiptTarget.loanId}-${attachReceiptTarget.paymentId}`
          }
          open={Boolean(attachReceiptTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setAttachReceiptTarget(null)
            }
          }}
          target={attachReceiptTarget}
        />
      )}

      <ReceiptPreviewModal
        open={receiptPreview.open}
        onOpenChange={(open) =>
          setReceiptPreview((prev) => ({ ...prev, open }))
        }
        title={receiptPreview.title}
        subtitle={receiptPreview.subtitle}
        previewUrl={receiptPreview.previewUrl}
        fileType={receiptPreview.fileType}
        fileName={receiptPreview.fileName}
        isLoading={receiptPreview.isLoading}
        errorMessage={receiptPreview.errorMessage}
      />
    </div>
  )
}
