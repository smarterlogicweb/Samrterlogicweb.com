import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { rateLimitForm } from '@/lib/utils/rateLimit';
import { contactFormSchema, validateSchema, Sanitizer } from '@/lib/utils/validation';
import { sendContactEmail } from '@/lib/services/email';
import { ProjectType } from '@prisma/client';

// Helper: strip HTML tags and normalize whitespace
function cleanText(input: string): string {
  return (input || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Map UI project values to Prisma enum
function mapProjectToEnum(project: string): ProjectType {
  const p = (project || '').toLowerCase();
  switch (p) {
    case 'vitrine':
    case 'site vitrine':
      return ProjectType.SITE_VITRINE;
    case 'ecommerce':
    case 'e-commerce':
      return ProjectType.ECOMMERCE;
    case 'application':
      return ProjectType.APPLICATION;
    case 'refonte':
      return ProjectType.REFONTE;
    case 'blog':
      return ProjectType.BLOG;
    case 'portfolio':
      return ProjectType.PORTFOLIO;
    case 'web3':
      return ProjectType.WEB3;
    case 'mobile':
      return ProjectType.MOBILE;
    default:
      return ProjectType.OTHER;
  }
}

function parseBudgetToInt(budget: string | undefined): number | null {
  if (!budget) return null;
  const numbers = budget.match(/\d[\d\s]*/g);
  if (!numbers || numbers.length === 0) return null;
  const first = numbers[0].replace(/\s/g, '');
  const val = parseInt(first, 10);
  return Number.isFinite(val) ? val : null;
}

export async function POST(request: NextRequest) {
  // Rate limit
  const limit = await rateLimitForm(request);
  if (!limit.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Trop de requêtes. Veuillez réessayer plus tard.',
        },
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit.limit),
          'X-RateLimit-Remaining': String(limit.remaining),
          'X-RateLimit-Reset': String(limit.reset),
        },
      }
    );
  }

  // Accept JSON and form submissions (progressive enhancement)
  let body: Record<string, any> = {};
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = typeof value === 'string' ? value : String(value);
      });
    } else {
      // Try JSON by default
      body = await request.json().catch(() => ({}));
    }
  } catch {
    // ignore, handled by validation below
  }

  // Honeypot anti-spam (accept both "company" and "website" as traps)
  if ((body.company && String(body.company).trim() !== '') || (body.website && String(body.website).trim() !== '')) {
    // Pretend success to avoid tipping off bots
    return NextResponse.json({ success: true, data: { message: 'Merci, nous revenons vers vous rapidement.' } });
  }

  // Normalize incoming fields from the public form
  const payload = {
    name: cleanText(body.name || ''),
    email: Sanitizer.email(body.email || ''),
    phone: body.phone ? Sanitizer.phone(body.phone) : undefined,
    project: (body.project || body.projectType || '').toString().toLowerCase(),
    budget: (body.budget || '').toString(),
    timeline: (body.timeline || '').toString(),
    message: cleanText(body.message || ''),
  };

  // Validate
  const validation = validateSchema(payload, contactFormSchema);
  if (!validation.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Certaines données sont invalides',
          details: Object.fromEntries(Object.entries(validation.errors).map(([k, v]) => [k, v[0]])),
        },
      },
      { status: 400 }
    );
  }

  // Collect meta
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '';
  const userAgent = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';

  try {
    // Persist contact
    const contact = await prisma.contact.create({
      data: {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        company: body.company_name ? cleanText(body.company_name) : undefined,
        message: payload.message,
        projectType: mapProjectToEnum(payload.project),
        budget: parseBudgetToInt(payload.budget) ?? undefined,
        timeline: payload.timeline,
        status: 'NEW',
        source: referrer || 'website',
        ipAddress,
        userAgent,
        referrer,
      },
    });

    // Send notifications (admin + client)
    try {
      await sendContactEmail({
        to: 'admin@salwadevstudio.com',
        subject: `📩 Nouveau message de contact — ${payload.name}`,
        contact: {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          company: body.company_name || '',
          projectType: payload.project,
          budget: payload.budget,
          timeline: payload.timeline,
          message: payload.message,
        },
        contactId: contact.id,
      });

      await sendContactEmail({
        to: payload.email,
        subject: '✅ Votre message a bien été reçu — SDS',
        template: 'contact_confirmation',
        contact: {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          company: body.company_name || '',
          projectType: payload.project,
          budget: payload.budget,
          timeline: payload.timeline,
          message: payload.message,
        },
      });
    } catch (e) {
      // Do not fail the request if email fails; log in DB
      await prisma.errorLog.create({
        data: {
          code: 'EMAIL_ERROR',
          message: (e as Error).message,
          severity: 'low',
          details: { context: 'contact_email' },
          userAgent,
          ipAddress,
          referrer,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: contact.id,
          message: 'Votre message a été envoyé avec succès. Nous revenons vers vous sous 24h.',
        },
      },
      { status: 201 }
    );
  } catch (e) {
    await prisma.errorLog.create({
      data: {
        code: 'INTERNAL_ERROR',
        message: (e as Error).message,
        severity: 'medium',
        details: { route: '/api/contact' },
        userAgent,
        ipAddress,
        referrer,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Une erreur est survenue. Merci de réessayer plus tard.',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, today, thisWeek, thisMonth] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.contact.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.contact.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { total, today, thisWeek, thisMonth },
    });
  } catch (e) {
    await prisma.errorLog.create({
      data: {
        code: 'STATS_ERROR',
        message: (e as Error).message,
        severity: 'low',
        details: { route: '/api/contact' },
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: 'Impossible de récupérer les statistiques de contact',
        },
      },
      { status: 500 }
    );
  }
}