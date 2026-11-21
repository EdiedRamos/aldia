import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { archiveContactUseCase } from '@/features/contacts/application/archive-contact.use-case'
import { createContactUseCase } from '@/features/contacts/application/create-contact.use-case'
import { getContactsUseCase } from '@/features/contacts/application/get-contacts.use-case'
import { updateContactUseCase } from '@/features/contacts/application/update-contact.use-case'
import {
  ContactDomainError,
  type Contact,
} from '@/features/contacts/domain/contact.entity'
import {
  ContactPhotoPolicyError,
  MAX_CONTACT_PHOTO_SIZE_BYTES,
} from '@/features/contacts/domain/contact.policy'
import type {
  IContactPhotoStorage,
  IContactRepository,
} from '@/features/contacts/domain/contact.repository'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    userId: 'u-1',
    name: 'Carlos Gómez',
    phone: '+573001234567',
    guarantorContactId: null,
    photoPath: null,
    notes: null,
    status: 'ACTIVE',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

function createMockRepository(
  overrides: Partial<IContactRepository> = {}
): IContactRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue([]),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findActiveByPhone: vi.fn().mockResolvedValue(null),
    findActiveByGuarantorId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
  }
}

function createMockPhotoStorage(
  overrides: Partial<IContactPhotoStorage> = {}
): IContactPhotoStorage {
  return {
    uploadPhoto: vi.fn().mockResolvedValue({
      photoPath: 'contacts/u-1/c-1/avatar.jpg',
    }),
    getPhotoReadUrl: vi
      .fn()
      .mockResolvedValue('https://storage.example.com/signed-avatar.jpg'),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('features/contacts/application - getContactsUseCase', () => {
  it('resolves guarantor info, effectivePhone, referredCount, and signed photo URLs sorted alphabetically', async () => {
    const guarantor = makeContact({
      id: 'c-guarantor',
      name: 'Carlos Gómez',
      phone: '+573001234567',
      photoPath: 'contacts/u-1/c-guarantor/avatar.jpg',
    })
    const referred = makeContact({
      id: 'c-third',
      name: 'Ana Referida',
      phone: null,
      guarantorContactId: 'c-guarantor',
      photoPath: null,
    })
    const foreignPhoto = makeContact({
      id: 'c-suspicious',
      name: 'Bruno',
      phone: '+573109998877',
      photoPath: 'contacts/other-user/c-suspicious/avatar.jpg',
    })

    const contactRepository = createMockRepository({
      findActiveByUserId: vi
        .fn()
        .mockResolvedValue([guarantor, referred, foreignPhoto]),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    const result = await getContactsUseCase('u-1', {
      contactRepository,
      contactPhotoStorage,
      signedUrlTtlSeconds: 1800,
    })

    expect(result.map((c) => c.id)).toEqual([
      'c-third',
      'c-suspicious',
      'c-guarantor',
    ])

    const ana = result[0]
    expect(ana.guarantor).toEqual({
      id: 'c-guarantor',
      name: 'Carlos Gómez',
      phone: '+573001234567',
    })
    expect(ana.effectivePhone).toBe('+573001234567')
    expect(ana.photoUrl).toBeNull()

    const bruno = result[1]
    expect(bruno.photoUrl).toBeNull()

    const carlos = result[2]
    expect(carlos.referredCount).toBe(1)
    expect(carlos.photoUrl).toBe(
      'https://storage.example.com/signed-avatar.jpg'
    )
    expect(contactPhotoStorage.getPhotoReadUrl).toHaveBeenCalledTimes(1)
    expect(contactPhotoStorage.getPhotoReadUrl).toHaveBeenCalledWith(
      'contacts/u-1/c-guarantor/avatar.jpg',
      1800
    )
  })
})

describe('features/contacts/application - createContactUseCase', () => {
  it('creates a contact with normalized E.164 phone and optional profile photo', async () => {
    const createdWithoutPhoto = makeContact({
      id: 'c-new',
      name: 'Laura Díaz',
      phone: '+573124567890',
      photoPath: null,
    })
    const updatedWithPhoto = {
      ...createdWithoutPhoto,
      photoPath: 'contacts/u-1/c-new/avatar.jpg',
    }

    const contactRepository = createMockRepository({
      create: vi.fn().mockResolvedValue(createdWithoutPhoto),
      update: vi.fn().mockResolvedValue(updatedWithPhoto),
    })
    const contactPhotoStorage = createMockPhotoStorage({
      uploadPhoto: vi.fn().mockResolvedValue({
        photoPath: 'contacts/u-1/c-new/avatar.jpg',
      }),
    })

    const result = await createContactUseCase(
      'u-1',
      {
        name: 'Laura Díaz',
        phone: '312 456 7890',
        notes: 'Vecina',
        photo: {
          buffer: Buffer.from('fake-jpeg-bytes'),
          contentType: 'image/jpeg',
          fileName: 'laura.jpg',
        },
      },
      { contactRepository, contactPhotoStorage }
    )

    expect(contactRepository.findActiveByPhone).toHaveBeenCalledWith(
      'u-1',
      '+573124567890'
    )
    expect(contactRepository.create).toHaveBeenCalledWith({
      userId: 'u-1',
      name: 'Laura Díaz',
      phone: '+573124567890',
      guarantorContactId: null,
      photoPath: null,
      notes: 'Vecina',
      status: 'ACTIVE',
    })
    expect(contactPhotoStorage.uploadPhoto).toHaveBeenCalledWith({
      userId: 'u-1',
      contactId: 'c-new',
      buffer: Buffer.from('fake-jpeg-bytes'),
      contentType: 'image/jpeg',
      extension: 'jpg',
    })
    expect(contactRepository.update).toHaveBeenCalledWith('c-new', 'u-1', {
      photoPath: 'contacts/u-1/c-new/avatar.jpg',
    })
    expect(result.photoPath).toBe('contacts/u-1/c-new/avatar.jpg')
  })

  it('creates a third-party contact without phone when guarantor is active and has own phone', async () => {
    const guarantor = makeContact({
      id: 'c-guarantor',
      name: 'Carlos Gómez',
      phone: '+573001234567',
    })
    const createdThirdParty = makeContact({
      id: 'c-third',
      name: 'Pedro Tercero',
      phone: null,
      guarantorContactId: 'c-guarantor',
    })

    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(guarantor),
      create: vi.fn().mockResolvedValue(createdThirdParty),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    const result = await createContactUseCase(
      'u-1',
      {
        name: 'Pedro Tercero',
        phone: '',
        guarantorContactId: 'c-guarantor',
      },
      { contactRepository, contactPhotoStorage }
    )

    expect(contactRepository.findActiveByPhone).not.toHaveBeenCalled()
    expect(contactRepository.findById).toHaveBeenCalledWith(
      'c-guarantor',
      'u-1'
    )
    expect(result.phone).toBeNull()
    expect(result.guarantorContactId).toBe('c-guarantor')
  })

  it('blocks creating a contact with neither phone nor guarantor', async () => {
    const contactRepository = createMockRepository()
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      createContactUseCase(
        'u-1',
        { name: 'Sin Canal', phone: null, guarantorContactId: null },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toBeInstanceOf(ZodError)

    expect(contactRepository.create).not.toHaveBeenCalled()
  })

  it('blocks duplicate phone among active contacts of the same user', async () => {
    const existing = makeContact({
      id: 'c-existing',
      name: 'Carlos Gómez',
      phone: '+573001234567',
    })
    const contactRepository = createMockRepository({
      findActiveByPhone: vi.fn().mockResolvedValue(existing),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      createContactUseCase(
        'u-1',
        { name: 'Otro Contacto', phone: '3001234567' },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toMatchObject({
      code: 'DUPLICATE_PHONE',
    })

    expect(contactRepository.create).not.toHaveBeenCalled()
  })

  it('blocks creating a third-party contact when guarantor is missing, archived, or lacks own phone', async () => {
    const contactPhotoStorage = createMockPhotoStorage()

    // Missing guarantor
    const repoMissing = createMockRepository({
      findById: vi.fn().mockResolvedValue(null),
    })
    await expect(
      createContactUseCase(
        'u-1',
        { name: 'Tercero', guarantorContactId: 'c-missing' },
        { contactRepository: repoMissing, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'GUARANTOR_NOT_FOUND' })

    // Archived guarantor
    const repoArchived = createMockRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeContact({ id: 'c-arch', status: 'ARCHIVED' })),
    })
    await expect(
      createContactUseCase(
        'u-1',
        { name: 'Tercero', guarantorContactId: 'c-arch' },
        { contactRepository: repoArchived, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'GUARANTOR_NOT_FOUND' })

    // Active guarantor without own phone
    const repoNoPhone = createMockRepository({
      findById: vi.fn().mockResolvedValue(
        makeContact({
          id: 'c-no-phone',
          phone: null,
          guarantorContactId: 'c-root',
        })
      ),
    })
    await expect(
      createContactUseCase(
        'u-1',
        { name: 'Tercero', guarantorContactId: 'c-no-phone' },
        { contactRepository: repoNoPhone, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'GUARANTOR_WITHOUT_PHONE' })
  })

  it('enforces photo policy (<= 2 MB, image/*) before touching repository or storage', async () => {
    const contactRepository = createMockRepository()
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      createContactUseCase(
        'u-1',
        {
          name: 'Ana',
          phone: '3001234567',
          photo: {
            buffer: Buffer.alloc(MAX_CONTACT_PHOTO_SIZE_BYTES + 1),
            contentType: 'image/jpeg',
          },
        },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toBeInstanceOf(ContactPhotoPolicyError)

    await expect(
      createContactUseCase(
        'u-1',
        {
          name: 'Ana',
          phone: '3001234567',
          photo: {
            buffer: Buffer.from('%PDF-1.7'),
            contentType: 'application/pdf',
          },
        },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toBeInstanceOf(ContactPhotoPolicyError)

    expect(contactRepository.create).not.toHaveBeenCalled()
    expect(contactPhotoStorage.uploadPhoto).not.toHaveBeenCalled()
  })
})

describe('features/contacts/application - updateContactUseCase', () => {
  it('blocks setting a contact as its own guarantor', async () => {
    const existing = makeContact({ id: 'c-1' })
    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      updateContactUseCase(
        'c-1',
        'u-1',
        { guarantorContactId: 'c-1' },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'SELF_GUARANTOR' })

    expect(contactRepository.update).not.toHaveBeenCalled()
  })

  it('blocks removing phone if contact has no guarantor left', async () => {
    const existing = makeContact({
      id: 'c-1',
      phone: '+573001234567',
      guarantorContactId: null,
    })
    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      updateContactUseCase(
        'c-1',
        'u-1',
        { phone: null },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'MISSING_CONTACT_CHANNEL' })
  })

  it('blocks removing direct phone from a contact who is an active guarantor of others', async () => {
    const existing = makeContact({
      id: 'c-1',
      phone: '+573001234567',
      guarantorContactId: 'c-other',
    })
    const dependent = makeContact({
      id: 'c-dep',
      phone: null,
      guarantorContactId: 'c-1',
    })

    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
      findActiveByGuarantorId: vi.fn().mockResolvedValue([dependent]),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    await expect(
      updateContactUseCase(
        'c-1',
        'u-1',
        { phone: null },
        { contactRepository, contactPhotoStorage }
      )
    ).rejects.toMatchObject({ code: 'CANNOT_REMOVE_PHONE_WHILE_GUARANTOR' })
  })

  it('allows adding a direct phone to a third-party contact, clearing its guarantor, and deleting removed photo', async () => {
    const existing = makeContact({
      id: 'c-third',
      name: 'Pedro',
      phone: null,
      guarantorContactId: 'c-guarantor',
      photoPath: 'contacts/u-1/c-third/avatar.png',
    })
    const updatedContact = makeContact({
      id: 'c-third',
      name: 'Pedro',
      phone: '+573151112233',
      guarantorContactId: null,
      photoPath: null,
    })

    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
      findActiveByPhone: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(updatedContact),
    })
    const contactPhotoStorage = createMockPhotoStorage()

    const result = await updateContactUseCase(
      'c-third',
      'u-1',
      {
        phone: '315 111 2233',
        guarantorContactId: null,
        removePhoto: true,
      },
      { contactRepository, contactPhotoStorage }
    )

    expect(contactRepository.update).toHaveBeenCalledWith('c-third', 'u-1', {
      name: 'Pedro',
      phone: '+573151112233',
      guarantorContactId: null,
      notes: null,
      photoPath: null,
    })
    expect(contactPhotoStorage.deletePhoto).toHaveBeenCalledWith(
      'contacts/u-1/c-third/avatar.png'
    )
    expect(result.phone).toBe('+573151112233')
    expect(result.photoPath).toBeNull()
  })
})

describe('features/contacts/application - archiveContactUseCase', () => {
  it('archives a contact with no active dependents', async () => {
    const existing = makeContact({ id: 'c-1', name: 'Luis' })
    const archived = { ...existing, status: 'ARCHIVED' as const }

    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
      findActiveByGuarantorId: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(archived),
    })

    const result = await archiveContactUseCase('c-1', 'u-1', {
      contactRepository,
    })

    expect(contactRepository.update).toHaveBeenCalledWith('c-1', 'u-1', {
      status: 'ARCHIVED',
    })
    expect(result.status).toBe('ARCHIVED')
  })

  it('blocks archiving a contact who is an active guarantor of other contacts', async () => {
    const existing = makeContact({ id: 'c-guarantor', name: 'Carlos Gómez' })
    const dependent = makeContact({
      id: 'c-third',
      name: 'Pedro Tercero',
      phone: null,
      guarantorContactId: 'c-guarantor',
    })

    const contactRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(existing),
      findActiveByGuarantorId: vi.fn().mockResolvedValue([dependent]),
    })

    await expect(
      archiveContactUseCase('c-guarantor', 'u-1', { contactRepository })
    ).rejects.toThrow(ContactDomainError)

    await expect(
      archiveContactUseCase('c-guarantor', 'u-1', { contactRepository })
    ).rejects.toMatchObject({
      code: 'CONTACT_IS_ACTIVE_GUARANTOR',
    })

    expect(contactRepository.update).not.toHaveBeenCalled()
  })
})
