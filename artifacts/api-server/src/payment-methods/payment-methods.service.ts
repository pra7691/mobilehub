import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentMethodVerificationStatus } from '@prisma/client';

function maskUpiId(upiId: string): string {
  const atIdx = upiId.indexOf('@');
  if (atIdx < 0) return '***@???';
  const local = upiId.slice(0, atIdx);
  const domain = upiId.slice(atIdx);
  if (local.length <= 3) return local + '***' + domain;
  return local.slice(0, 3) + '*'.repeat(Math.min(local.length - 3, 3)) + domain;
}

function validateUpiId(upiId: string): void {
  const trimmed = upiId.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx < 1 || atIdx === trimmed.length - 1 || trimmed.includes(' ')) {
    throw new BadRequestException('Invalid UPI ID format. Example: name@upi');
  }
}

function formatPaymentMethod(
  pm: {
    id: string;
    userId: string;
    type: string;
    upiId: string;
    upiIdMasked: string;
    verificationStatus: PaymentMethodVerificationStatus;
    rejectionReason: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  includeFullUpi = false,
) {
  return {
    id: pm.id,
    userId: pm.userId,
    type: pm.type,
    upiIdMasked: pm.upiIdMasked,
    ...(includeFullUpi ? { upiId: pm.upiId } : {}),
    verificationStatus: pm.verificationStatus,
    rejectionReason: pm.rejectionReason,
    isDefault: pm.isDefault,
    createdAt: pm.createdAt,
    updatedAt: pm.updatedAt,
  };
}

@Injectable()
export class PaymentMethodsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getMyPaymentMethods(userId: string) {
    const methods = await this.prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return methods.map((m) => formatPaymentMethod(m, false));
  }

  async getMyPaymentMethodWithFullUpi(userId: string, methodId: string) {
    const method = await this.prisma.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    return formatPaymentMethod(method, true);
  }

  async addOrUpdateUpiPaymentMethod(userId: string, upiId: string) {
    validateUpiId(upiId);
    const trimmed = upiId.trim().toLowerCase();
    const masked = maskUpiId(trimmed);

    const activeProcessing = await this.prisma.payoutRequest.findFirst({
      where: { userId, status: 'PROCESSING' },
    });
    if (activeProcessing) {
      throw new ForbiddenException(
        'Cannot update UPI ID while a payout request is being processed',
      );
    }

    const existing = await this.prisma.userPaymentMethod.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    let method;
    if (existing) {
      method = await this.prisma.userPaymentMethod.update({
        where: { id: existing.id },
        data: {
          upiId: trimmed,
          upiIdMasked: masked,
          verificationStatus: 'PENDING_VERIFICATION',
          rejectionReason: null,
        },
      });
      await this.audit.log('payment_method.upi_updated', {}, {
        entityType: 'UserPaymentMethod',
        entityId: method.id,
        metadata: { userId, upiIdMasked: masked },
      });
    } else {
      method = await this.prisma.userPaymentMethod.create({
        data: { userId, upiId: trimmed, upiIdMasked: masked },
      });
      await this.audit.log('payment_method.upi_added', {}, {
        entityType: 'UserPaymentMethod',
        entityId: method.id,
        metadata: { userId, upiIdMasked: masked },
      });
    }

    return formatPaymentMethod(method, true);
  }

  async adminGetPaymentMethod(methodId: string) {
    const method = await this.prisma.userPaymentMethod.findUnique({
      where: { id: methodId },
      include: { user: { select: { id: true, phoneNumber: true, name: true } } },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    return { ...formatPaymentMethod(method, true), user: method.user };
  }

  async adminVerifyUpi(methodId: string, adminId: string, adminEmail: string) {
    const method = await this.prisma.userPaymentMethod.findUnique({ where: { id: methodId } });
    if (!method) throw new NotFoundException('Payment method not found');

    const updated = await this.prisma.userPaymentMethod.update({
      where: { id: methodId },
      data: { verificationStatus: 'VERIFIED', rejectionReason: null },
    });

    await this.audit.log('payment_method.upi_verified', { adminId, adminEmail }, {
      entityType: 'UserPaymentMethod',
      entityId: methodId,
      metadata: { userId: method.userId, upiIdMasked: method.upiIdMasked },
    });

    return formatPaymentMethod(updated, false);
  }

  async adminRejectUpi(
    methodId: string,
    rejectionReason: string,
    adminId: string,
    adminEmail: string,
  ) {
    const method = await this.prisma.userPaymentMethod.findUnique({ where: { id: methodId } });
    if (!method) throw new NotFoundException('Payment method not found');

    const updated = await this.prisma.userPaymentMethod.update({
      where: { id: methodId },
      data: { verificationStatus: 'REJECTED', rejectionReason },
    });

    await this.audit.log('payment_method.upi_rejected', { adminId, adminEmail }, {
      entityType: 'UserPaymentMethod',
      entityId: methodId,
      metadata: { userId: method.userId, upiIdMasked: method.upiIdMasked, rejectionReason },
    });

    return formatPaymentMethod(updated, false);
  }
}
