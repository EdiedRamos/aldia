import 'server-only'
import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from 'firebase-admin/firestore'

import {
  ServiceDomainError,
  type Service,
  type ServicePayment,
  type ServicePaymentStatus,
  type ServiceStatus,
} from '@/features/services/domain/service.entity'
import type {
  CreateServiceData,
  IServiceRepository,
  UpdateServiceData,
  VoidServicePaymentData,
} from '@/features/services/domain/service.repository'
import { getAdminDb } from '@/lib/firebase-admin'

const SERVICES_COLLECTION = 'services'
const SERVICE_PAYMENTS_COLLECTION = 'servicePayments'

function toIsoDateString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    return value
  }

  return new Date().toISOString()
}

function mapDocToService(id: string, data: DocumentData): Service {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    billingDay: Number(data.billingDay ?? 1),
    startPeriod: String(data.startPeriod ?? ''),
    paymentUrl: data.paymentUrl ? String(data.paymentUrl) : undefined,
    referenceCode: data.referenceCode ? String(data.referenceCode) : undefined,
    status: (data.status as ServiceStatus) ?? 'ACTIVE',
    createdAt: toIsoDateString(data.createdAt),
  }
}

function mapDocToServicePayment(
  id: string,
  data: DocumentData
): ServicePayment {
  const status: ServicePaymentStatus =
    data.status === 'VOIDED' ? 'VOIDED' : 'ACTIVE'

  return {
    id,
    userId: String(data.userId ?? ''),
    serviceId: String(data.serviceId ?? ''),
    period: String(data.period ?? ''),
    paidAt: toIsoDateString(data.paidAt),
    receiptUrl: String(data.receiptUrl ?? ''),
    receiptType: String(data.receiptType ?? 'IMAGE'),
    receiptPath: String(data.receiptPath ?? ''),
    status,
    voidedAt: data.voidedAt ? toIsoDateString(data.voidedAt) : null,
    voidReason: typeof data.voidReason === 'string' ? data.voidReason : null,
  }
}

export class FirestoreServiceRepository implements IServiceRepository {
  async findByUserId(userId: string): Promise<Service[]> {
    const snapshot = await getAdminDb()
      .collection(SERVICES_COLLECTION)
      .where('userId', '==', userId)
      .get()

    return snapshot.docs
      .map((doc) => mapDocToService(doc.id, doc.data()))
      .sort((a, b) => a.billingDay - b.billingDay)
  }

  async findPaymentsByUserId(userId: string): Promise<ServicePayment[]> {
    const snapshot = await getAdminDb()
      .collection(SERVICE_PAYMENTS_COLLECTION)
      .where('userId', '==', userId)
      .get()

    return snapshot.docs.map((doc) =>
      mapDocToServicePayment(doc.id, doc.data())
    )
  }

  async findById(serviceId: string, userId: string): Promise<Service | null> {
    const doc = await getAdminDb()
      .collection(SERVICES_COLLECTION)
      .doc(serviceId)
      .get()

    if (!doc.exists) {
      return null
    }

    const data = doc.data()
    if (!data || data.userId !== userId) {
      return null
    }

    return mapDocToService(doc.id, data)
  }

  async create(serviceData: CreateServiceData): Promise<Service> {
    const docRef = getAdminDb().collection(SERVICES_COLLECTION).doc()
    const nowIso = new Date().toISOString()

    const payload: Record<string, unknown> = {
      userId: serviceData.userId,
      name: serviceData.name,
      billingDay: serviceData.billingDay,
      startPeriod: serviceData.startPeriod,
      paymentUrl: serviceData.paymentUrl || null,
      referenceCode: serviceData.referenceCode || null,
      status: serviceData.status,
      createdAt: FieldValue.serverTimestamp(),
    }

    await docRef.set(payload)

    return {
      id: docRef.id,
      userId: serviceData.userId,
      name: serviceData.name,
      billingDay: serviceData.billingDay,
      startPeriod: serviceData.startPeriod,
      paymentUrl: serviceData.paymentUrl || undefined,
      referenceCode: serviceData.referenceCode || undefined,
      status: serviceData.status,
      createdAt: nowIso,
    }
  }

  async update(
    serviceId: string,
    userId: string,
    data: UpdateServiceData
  ): Promise<Service> {
    const existing = await this.findById(serviceId, userId)
    if (!existing) {
      throw new Error('Service not found or access denied')
    }

    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (data.name !== undefined) {
      updatePayload.name = data.name
    }
    if (data.billingDay !== undefined) {
      updatePayload.billingDay = data.billingDay
    }
    if (data.startPeriod !== undefined) {
      updatePayload.startPeriod = data.startPeriod
    }
    if (data.paymentUrl !== undefined) {
      updatePayload.paymentUrl = data.paymentUrl || null
    }
    if (data.referenceCode !== undefined) {
      updatePayload.referenceCode = data.referenceCode || null
    }
    if (data.status !== undefined) {
      updatePayload.status = data.status
    }

    await getAdminDb()
      .collection(SERVICES_COLLECTION)
      .doc(serviceId)
      .update(updatePayload)

    return {
      ...existing,
      ...data,
      paymentUrl:
        data.paymentUrl !== undefined
          ? data.paymentUrl || undefined
          : existing.paymentUrl,
      referenceCode:
        data.referenceCode !== undefined
          ? data.referenceCode || undefined
          : existing.referenceCode,
    }
  }

  async savePayments(payments: ServicePayment[]): Promise<void> {
    if (payments.length === 0) {
      return
    }

    const db = getAdminDb()
    const batch = db.batch()

    for (const payment of payments) {
      const docId = payment.id || `${payment.serviceId}_${payment.period}`
      const docRef = db.collection(SERVICE_PAYMENTS_COLLECTION).doc(docId)

      batch.set(docRef, {
        userId: payment.userId,
        serviceId: payment.serviceId,
        period: payment.period,
        paidAt:
          payment.paidAt instanceof Date
            ? Timestamp.fromDate(payment.paidAt)
            : FieldValue.serverTimestamp(),
        receiptUrl: payment.receiptUrl,
        receiptType: payment.receiptType,
        receiptPath: payment.receiptPath,
        status: payment.status === 'VOIDED' ? 'VOIDED' : 'ACTIVE',
        voidedAt: payment.voidedAt
          ? payment.voidedAt instanceof Date
            ? Timestamp.fromDate(payment.voidedAt)
            : Timestamp.fromDate(new Date(payment.voidedAt))
          : null,
        voidReason: payment.voidReason ?? null,
      })
    }

    await batch.commit()
  }

  async voidPayment(data: VoidServicePaymentData): Promise<ServicePayment> {
    const db = getAdminDb()
    const serviceRef = db.collection(SERVICES_COLLECTION).doc(data.serviceId)
    const paymentRef = db
      .collection(SERVICE_PAYMENTS_COLLECTION)
      .doc(data.paymentId)

    return db.runTransaction(async (tx) => {
      const [serviceSnap, paymentSnap] = await Promise.all([
        tx.get(serviceRef),
        tx.get(paymentRef),
      ])

      if (!serviceSnap.exists) {
        throw new ServiceDomainError(
          'SERVICE_NOT_FOUND',
          `Service ${data.serviceId} not found`,
          'El servicio no existe o no tienes acceso a él.'
        )
      }

      const serviceData = serviceSnap.data()
      if (!serviceData || serviceData.userId !== data.userId) {
        throw new ServiceDomainError(
          'SERVICE_NOT_FOUND',
          `Service ${data.serviceId} does not belong to user ${data.userId}`,
          'El servicio no existe o no tienes acceso a él.'
        )
      }

      if (serviceData.status === 'ARCHIVED') {
        throw new ServiceDomainError(
          'SERVICE_ARCHIVED',
          `Cannot void payment on archived service ${data.serviceId}`,
          'No se pueden anular pagos en servicios archivados.'
        )
      }

      if (!paymentSnap.exists) {
        throw new ServiceDomainError(
          'PAYMENT_NOT_FOUND',
          `Payment ${data.paymentId} not found`,
          'No se encontró el pago especificado en este servicio.'
        )
      }

      const paymentData = paymentSnap.data()
      if (
        !paymentData ||
        paymentData.userId !== data.userId ||
        paymentData.serviceId !== data.serviceId
      ) {
        throw new ServiceDomainError(
          'PAYMENT_NOT_FOUND',
          `Payment ${data.paymentId} does not belong to service ${data.serviceId} and user ${data.userId}`,
          'No se encontró el pago especificado en este servicio.'
        )
      }

      if (paymentData.status === 'VOIDED') {
        throw new ServiceDomainError(
          'PAYMENT_ALREADY_VOIDED',
          `Payment ${data.paymentId} is already voided`,
          'Este pago ya fue anulado anteriormente.'
        )
      }

      const voidedDate = new Date(data.voidedAt)
      const voidedTimestamp = Number.isNaN(voidedDate.getTime())
        ? FieldValue.serverTimestamp()
        : Timestamp.fromDate(voidedDate)

      tx.update(paymentRef, {
        status: 'VOIDED',
        voidedAt: voidedTimestamp,
        voidReason: data.voidReason,
      })

      tx.update(serviceRef, {
        nextPendingPeriod: data.nextPendingPeriod,
        coveredUntilPeriod: data.coveredUntilPeriod,
        updatedAt: FieldValue.serverTimestamp(),
      })

      const mapped = mapDocToServicePayment(paymentSnap.id, paymentData)
      return {
        ...mapped,
        status: 'VOIDED',
        voidedAt: data.voidedAt,
        voidReason: data.voidReason,
      }
    })
  }
}

export const firestoreServiceRepository = new FirestoreServiceRepository()
