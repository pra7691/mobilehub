import {
  Controller,
  Post,
  UseGuards,
  Headers,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AdminJwtGuard } from './auth/guards/admin-jwt.guard';
import { PrismaService } from './prisma/prisma.service';
import { AuditService, AuditAction } from './audit/audit.service';

/**
 * TEMPORARY production seed controller.
 * DELETE this file and remove SeedProdController from AppModule after successful seed.
 *
 * Security layers:
 *  1. AdminJwtGuard — valid admin bearer token required
 *  2. ALLOW_INTERNAL_SEED=true env flag must be set
 *  3. X-Seed-Token header must match INTERNAL_SEED_TOKEN env var
 *  4. One-time guard — rejected if SEED_COMPLETED_AT already in app_settings
 */

// ── Master data from development database ─────────────────────────────────

const CATEGORIES = [
  {
    name: 'Photographaa',
    nameEn: 'Photographaa',
    nameHi: null,
    description:
      'Capture high-quality images of products, people, and environments for AI training datasets.',
    descriptionEn:
      'Capture high-quality images of products, people, and environments for AI training datasets.',
    descriptionHi: null,
    icon: '📸',
    displayOrder: 1,
    isActive: true,
  },
  {
    name: 'Audio Recording',
    nameEn: null,
    nameHi: null,
    description:
      'Record voice samples, ambient sounds, and speech data for AI voice and speech recognition models.',
    descriptionEn: null,
    descriptionHi: null,
    icon: '🎙️',
    displayOrder: 2,
    isActive: true,
  },
  {
    name: 'Video Collection',
    nameEn: null,
    nameHi: null,
    description:
      'Capture video footage of real-world scenes, activities, and environments for computer vision datasets.',
    descriptionEn: null,
    descriptionHi: null,
    icon: '🎥',
    displayOrder: 3,
    isActive: true,
  },
  {
    name: 'Data Verification',
    nameEn: null,
    nameHi: null,
    description: 'Verify and validate existing business listings, map data, and factual information.',
    descriptionEn: null,
    descriptionHi: null,
    icon: '🔍',
    displayOrder: 4,
    isActive: true,
  },
];

const SUBCATEGORIES = [
  { name: 'Product Photography', catName: 'Photographaa', displayOrder: 1, isActive: true },
  { name: 'Portrait Photography', catName: 'Photographaa', displayOrder: 2, isActive: true },
  { name: 'Speech Recognition', catName: 'Audio Recording', displayOrder: 1, isActive: true },
  { name: 'Environmental Audio', catName: 'Audio Recording', displayOrder: 2, isActive: true },
  { name: 'Street Scenes', catName: 'Video Collection', displayOrder: 1, isActive: true },
  { name: 'Retail Environments', catName: 'Video Collection', displayOrder: 2, isActive: true },
  { name: 'Business Listings', catName: 'Data Verification', displayOrder: 1, isActive: true },
  { name: 'Map Data', catName: 'Data Verification', displayOrder: 2, isActive: true },
];

const TASKS = [
  {
    title: 'Capture Retail Product Front View',
    catName: 'Photographaa',
    subName: 'Product Photography',
    description: "Photograph a retail product's front face on a clean, well-lit surface.",
    paymentAmount: 150.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'IMAGE',
    requiredOrientation: 'PORTRAIT',
    minimumImageCount: 1,
    maximumImageCount: 1,
    audioRequired: false,
    pauseAllowed: true,
    dos: [],
    donts: [],
    detailedInstructions:
      'Find a retail product (packaged food, electronics, cosmetics, etc.). Place it on a flat surface with good natural or artificial lighting. Ensure the product label faces the camera. Take a sharp, focused image with no blur.',
  },
  {
    title: 'Capture Product Label (All Sides)',
    catName: 'Photographaa',
    subName: 'Product Photography',
    description: 'Document all sides of a product label for ingredient and label data training.',
    paymentAmount: 25.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 4,
    maximumImageCount: 6,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Capture all 4 sides of the product',
      'Ensure text is sharp and readable',
      'Keep consistent distance and framing across shots',
      'Include barcode if present',
    ],
    donts: [
      "Don't photograph homemade or unlabeled items",
      "Don't allow motion blur",
      "Don't crop out important text",
    ],
    detailedInstructions:
      'Choose a packaged food or beverage product. Photograph each side of the packaging clearly. Ensure the nutrition label, ingredient list, and barcode are all visible in separate shots. Submit images in order: front, back, left side, right side.',
  },
  {
    title: 'Neutral Facial Expression Portrait',
    catName: 'Photographaa',
    subName: 'Portrait Photography',
    description:
      'Photograph your face with a neutral expression in good lighting for facial recognition training.',
    paymentAmount: 20.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'IMAGE',
    requiredOrientation: 'PORTRAIT',
    minimumImageCount: 3,
    maximumImageCount: 5,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Use good, even lighting on your face',
      'Keep a neutral, relaxed expression',
      'Ensure both eyes are fully open',
      'Remove glasses, hats, and hair covering the face',
    ],
    donts: [
      "Don't wear heavy makeup that alters facial structure",
      "Don't tilt head significantly",
      "Don't include other people in the frame",
      "Don't use heavy filters or beauty modes",
    ],
    detailedInstructions:
      'Set up your camera at eye level, approximately 50-70cm from your face. Look directly into the camera with a neutral expression (mouth closed, no smile). Ensure your face is fully visible from forehead to chin, and both ears are showing. Take 3 photos with slight variations in angle.',
  },
  {
    title: 'Varied Emotional Expression Portraits',
    catName: 'Photographaa',
    subName: 'Portrait Photography',
    description: 'Capture 5 different facial expressions for emotion detection model training.',
    paymentAmount: 40.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 5,
    maximumImageCount: 5,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Make each expression distinct and natural',
      'Maintain consistent lighting and camera position across shots',
      'Keep face fully centered in frame',
      'Submit images in the specified order',
    ],
    donts: [
      "Don't use the same expression twice",
      "Don't submit blurry or poorly lit images",
      "Don't use filters or face-altering apps",
    ],
    detailedInstructions:
      'Capture your face expressing 5 different emotions: happy (genuine smile), sad (downturned mouth, soft eyes), surprised (wide eyes, open mouth slightly), angry (furrowed brow, tight lips), and fearful (wide eyes, tense). Submit exactly one photo per emotion in this order.',
  },
  {
    title: 'Read English Sentences Aloud',
    catName: 'Audio Recording',
    subName: 'Speech Recognition',
    description:
      'Record yourself reading 10 provided English sentences clearly for ASR model training.',
    paymentAmount: 30.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'AUDIO',
    requiredOrientation: 'ANY',
    minimumDurationSeconds: 45,
    maximumDurationSeconds: 120,
    audioRequired: true,
    pauseAllowed: true,
    dos: [
      'Speak clearly at a natural, moderate pace',
      'Maintain consistent volume throughout',
      'Pause briefly between sentences',
      'Record in a quiet indoor space',
    ],
    donts: [
      "Don't rush through sentences",
      "Don't whisper or shout",
      "Don't record outdoors or in noisy areas",
      "Don't cough or clear throat mid-recording",
    ],
    detailedInstructions:
      'Find a quiet room with minimal background noise. Read each of the following sentences clearly and at a natural pace:\n1. The quick brown fox jumps over the lazy dog.\n2. She sells seashells by the seashore.\n3. How much wood would a woodchuck chuck?\n4. Pack my box with five dozen liquor jugs.\n5. The five boxing wizards jump quickly.\n6. Please call Stella and ask her to bring these things.\n7. I will not allow anyone to get too close.\n8. Look at the sky before you decide to go outside.\n9. The weather today is quite pleasant for a walk.\n10. Technology has changed how we communicate with each other.',
  },
  {
    title: 'Count and Spell Numbers 1–20',
    catName: 'Audio Recording',
    subName: 'Speech Recognition',
    description:
      'Record yourself counting from 1 to 20 and spelling each number for numeric speech data.',
    paymentAmount: 20.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'AUDIO',
    requiredOrientation: 'ANY',
    minimumDurationSeconds: 60,
    maximumDurationSeconds: 180,
    audioRequired: true,
    pauseAllowed: true,
    dos: [
      'Speak each digit clearly',
      'Maintain consistent volume',
      'Record in quiet environment',
      'Pause between counting and spelling sections',
    ],
    donts: [
      "Don't skip numbers",
      "Don't mumble or speak too fast",
      "Don't add extra commentary",
    ],
    detailedInstructions:
      'In a quiet room, record a continuous audio where you:\n1. Count from 1 to 20 (say the number name: "one, two, three...")\n2. Then spell each number: "O-N-E, T-W-O..."\nSpeak at a clear, deliberate pace. There should be a 1-second pause between the counting section and the spelling section.',
  },
  {
    title: 'Capture Outdoor Market Ambience',
    catName: 'Audio Recording',
    subName: 'Environmental Audio',
    description: 'Record 60 seconds of authentic outdoor market or bazaar background audio.',
    paymentAmount: 25.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'AUDIO',
    requiredOrientation: 'ANY',
    minimumDurationSeconds: 60,
    maximumDurationSeconds: 90,
    audioRequired: true,
    pauseAllowed: true,
    dos: [
      'Record in a genuinely busy public market',
      'Hold the phone steady at waist or chest level',
      'Let the audio capture organically for the full duration',
      'Ensure the general crowd sound is present throughout',
    ],
    donts: [
      "Don't narrate or speak during recording",
      "Don't record in an empty or quiet market",
      "Don't point the phone at individuals' faces while recording",
      "Don't add background music afterwards",
    ],
    detailedInstructions:
      "Go to a busy outdoor market, bazaar, or street market. Hold your phone naturally (don't point it at any specific person). Record 60-90 seconds of the ambient sound — vendor calls, crowd chatter, and general market activity. Do not narrate or talk yourself.",
  },
  {
    title: 'Record Restaurant Background Noise',
    catName: 'Audio Recording',
    subName: 'Environmental Audio',
    description: 'Capture the authentic ambient soundscape of a busy restaurant or food court.',
    paymentAmount: 25.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'AUDIO',
    requiredOrientation: 'ANY',
    minimumDurationSeconds: 60,
    maximumDurationSeconds: 90,
    audioRequired: true,
    pauseAllowed: true,
    dos: [
      'Record during peak hours for authentic activity',
      'Keep the phone stable on a surface',
      'Capture a mix of conversation, cutlery, and kitchen sounds',
      'Stay for the full recording duration without leaving',
    ],
    donts: [
      "Don't record in an empty restaurant",
      "Don't speak loudly into the phone",
      "Don't record private conversations intentionally",
      "Don't use a restaurant where recording is prohibited",
    ],
    detailedInstructions:
      'Visit a restaurant, food court, or canteen during a busy period (lunch or dinner hour). Place your phone on the table with the microphone facing up. Record 60-90 seconds of the ambient environment — cutlery sounds, muffled conversations, kitchen noise, etc.',
  },
  {
    title: 'Busy Intersection Pedestrian Video',
    catName: 'Video Collection',
    subName: 'Street Scenes',
    description: 'Record 30 seconds of pedestrian activity at a busy road crossing or intersection.',
    paymentAmount: 35.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'VIDEO',
    requiredOrientation: 'LANDSCAPE',
    minimumDurationSeconds: 30,
    maximumDurationSeconds: 60,
    audioRequired: false,
    pauseAllowed: false,
    dos: [
      'Record in landscape (horizontal) orientation',
      'Capture natural pedestrian flow without staging',
      'Keep the camera as steady as possible',
      'Ensure adequate lighting (daylight or well-lit night scene)',
    ],
    donts: [
      "Don't zoom in on individuals' faces",
      "Don't record in portrait mode",
      "Don't add narration or commentary",
      "Don't record in places where filming is prohibited",
    ],
    detailedInstructions:
      'Stand at a busy pedestrian crossing or city intersection. Hold your phone in landscape mode and record the flow of pedestrians crossing the road. Keep the camera steady — you may use a stable surface or hold it with both hands. Do not follow specific individuals.',
  },
  {
    title: 'Pedestrian Footpath Activity',
    catName: 'Video Collection',
    subName: 'Street Scenes',
    description: 'Capture 30 seconds of people walking on a busy sidewalk or footpath.',
    paymentAmount: 30.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'VIDEO',
    requiredOrientation: 'LANDSCAPE',
    minimumDurationSeconds: 30,
    maximumDurationSeconds: 60,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Capture continuous pedestrian movement',
      'Record from a fixed position without moving',
      'Use rear camera for better quality',
      'Choose a time when there is significant foot traffic',
    ],
    donts: [
      "Don't pan the camera rapidly",
      "Don't intentionally focus on any single person",
      "Don't record private property without permission",
    ],
    detailedInstructions:
      'Find a busy footpath, sidewalk, or pedestrian walkway. Position yourself at the side and record the flow of people walking past. Keep the camera at approximately waist height pointing toward the path. Record for at least 30 seconds of continuous foot traffic.',
  },
  {
    title: 'Supermarket Aisle Walkthrough Video',
    catName: 'Video Collection',
    subName: 'Retail Environments',
    description: 'Record a slow walk through a supermarket aisle showing products on shelves.',
    paymentAmount: 40.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'VIDEO',
    requiredOrientation: 'LANDSCAPE',
    minimumDurationSeconds: 30,
    maximumDurationSeconds: 90,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Walk slowly and steadily through the aisle',
      'Capture both sides of the aisle if wide enough',
      'Keep shelves in clear focus',
      'Record in landscape orientation',
    ],
    donts: [
      "Don't record customers faces directly",
      "Don't record in restricted or staff-only areas",
      "Don't move the camera erratically",
      "Don't record empty aisles",
    ],
    detailedInstructions:
      'Enter a supermarket and navigate to a product aisle (cereal, beverages, snacks, etc.). Hold the phone in landscape mode and slowly walk the length of the aisle, keeping shelves in frame. The video should clearly show products on shelves from both sides. Record at walking pace — not too fast.',
  },
  {
    title: 'Food Court Activity Recording',
    catName: 'Video Collection',
    subName: 'Retail Environments',
    description: 'Capture ambient video of a food court or canteen during meal times.',
    paymentAmount: 35.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'VIDEO',
    requiredOrientation: 'LANDSCAPE',
    minimumDurationSeconds: 30,
    maximumDurationSeconds: 90,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Choose a busy mealtime period',
      'Record from a wide, elevated angle if possible',
      'Capture general crowd activity and movement',
      'Keep the camera stable throughout',
    ],
    donts: [
      "Don't zoom in on people's faces",
      "Don't record conversations",
      "Don't disturb customers or staff",
    ],
    detailedInstructions:
      'Visit a food court, canteen, or cafeteria during a busy mealtime. Find an elevated or wide vantage point. Record a stationary video of the general area showing people moving, sitting, eating, and standing in queues. Do not focus on individuals.',
  },
  {
    title: 'Verify Restaurant Storefront Details',
    catName: 'Data Verification',
    subName: 'Business Listings',
    description:
      "Photograph a restaurant's exterior signage and entrance for business listing verification.",
    paymentAmount: 20.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 2,
    maximumImageCount: 4,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Capture the complete business name in at least one image',
      'Take photos during actual business hours',
      'Ensure the establishment is currently operating',
      'Include the entrance/door in the storefront shot',
    ],
    donts: [
      "Don't photograph closed or shuttered establishments as open",
      "Don't alter or edit the images",
      "Don't photograph private residences",
    ],
    detailedInstructions:
      'Visit any restaurant, dhaba, or food establishment. Capture the following in separate images: (1) Full storefront showing the name sign clearly, (2) Close-up of the name/signboard showing the complete business name, (3) Menu board or entrance notice if visible. Ensure the photos are taken during business hours.',
  },
  {
    title: 'Confirm Shop Operating Hours',
    catName: 'Data Verification',
    subName: 'Business Listings',
    description: "Photograph a shop's stated operating hours notice or signboard.",
    paymentAmount: 15.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 1,
    maximumImageCount: 3,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Ensure the timing/hours text is fully readable',
      'Capture both the timings and the business name',
      "Photograph during the business's stated operating hours",
      'Include any "open/closed" sign if present',
    ],
    donts: [
      "Don't photograph handwritten unverified notes",
      "Don't submit if timings are not legible",
      "Don't photograph residential premises",
    ],
    detailedInstructions:
      "Find a shop, service center, or business that displays its opening hours. Capture: (1) A clear photo of the operating hours notice or board, (2) The shop name or exterior to confirm location. The timing notice must be legible in the photo.",
  },
  {
    title: 'Photograph Street Name Sign',
    catName: 'Data Verification',
    subName: 'Map Data',
    description: 'Capture a clear, readable image of an official street name sign or road sign.',
    paymentAmount: 12.0,
    status: 'active',
    displayOrder: 1,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 2,
    maximumImageCount: 4,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Capture the complete text of the sign legibly',
      "Include the sign's mounting structure in frame",
      'Take one close-up and one wider context shot',
      'Photograph in good lighting conditions',
    ],
    donts: [
      "Don't photograph private or shop name signs",
      "Don't submit blurry images where text is unreadable",
      "Don't capture partially obstructed signs if avoidable",
    ],
    detailedInstructions:
      'Find an official government-issued street name sign, road sign, or area marker. Photograph it clearly so that the complete text is fully readable. Include a wider shot showing the sign in its environment (attached to a pole, wall, or structure).',
  },
  {
    title: 'Capture Building Main Entrance',
    catName: 'Data Verification',
    subName: 'Map Data',
    description:
      'Photograph the main entrance of a significant building for map and navigation data.',
    paymentAmount: 18.0,
    status: 'active',
    displayOrder: 2,
    collectionType: 'IMAGE',
    requiredOrientation: 'ANY',
    minimumImageCount: 2,
    maximumImageCount: 4,
    audioRequired: false,
    pauseAllowed: true,
    dos: [
      'Capture the primary entrance (not a side or service entrance)',
      'Ensure building identification is visible',
      'Take in good lighting with unobstructed view',
      'Include a wide establishing shot',
    ],
    donts: [
      "Don't photograph residential buildings",
      "Don't photograph in restricted or secure areas",
      "Don't submit images taken at night unless well-lit",
    ],
    detailedInstructions:
      'Select a notable building: a hospital, school, government office, shopping mall, hotel, or landmark. Photograph: (1) The main entrance showing the entrance doors and any signage above it, (2) A wider shot of the full building facade if accessible. The building name or identification must be visible.',
  },
];

const FAQS = [
  {
    question: 'test',
    answer: 'test test test test test test test test test test test test test ',
    questionEn: null,
    answerEn: null,
    questionHi: null,
    answerHi: null,
    isActive: true,
    displayOrder: 0,
  },
];

const BANNERS = [
  {
    imageUrl: 'https://www.freeiconspng.com/uploads/banner-png-picture-9.png',
    mobileImageUrl: null,
    titleEn: null,
    titleHi: null,
    descriptionEn: null,
    descriptionHi: null,
    displayOrder: 0,
    isActive: true,
    startDate: new Date('2026-06-21T00:00:00Z'),
    endDate: new Date('2027-04-02T00:00:00Z'),
  },
];

const ADMIN_USER = {
  email: 'admin@capto.app',
  name: 'Super Admin',
  password: '$2a$10$RhJgH3MwBA3wm.3tOnYwMeg01G0lF1Qydfk6w47MDRaW9AVMsuDzK',
  role: 'super_admin',
  isActive: true,
};

const SUPPORT_SETTINGS = {
  email: 'support@verbosetechlabs.com',
  whatsappNumber: '',
  phoneNumber: null,
  workingHours: 'Mon–Fri, 10am–6pm IST',
  message: 'Our team is here to help. Reach out and we\'ll get back to you within 24 hours.',
};

const APP_SETTINGS = [
  { key: 'APP_NAME', value: 'tarzi' },
  { key: 'PAYOUT_ENABLED', value: 'true' },
  { key: 'PAYOUT_MIN_AMOUNT', value: '1' },
  { key: 'PAYOUT_MAX_AMOUNT', value: '' },
  { key: 'PAYOUT_MAX_DAILY_PER_USER', value: '' },
  { key: 'PAYOUT_MAX_PENDING_PER_USER', value: '' },
  { key: 'PAYOUT_MESSAGE', value: '' },
];

const LEGAL_SETTINGS = [
  {
    key: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    content: 'This is our privacy policy content.',
    isPublished: true,
    version: 2,
  },
  {
    key: 'TERMS_AND_CONDITIONS',
    title: 'Terms & Conditions',
    content: 'These are our terms.',
    isPublished: true,
    version: 1,
  },
];

// ── Controller ─────────────────────────────────────────────────────────────

@Controller('admin/internal')
@UseGuards(AdminJwtGuard)
export class SeedProdController {
  private readonly logger = new Logger(SeedProdController.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Post('apply-seed')
  async applySeed(@Headers('x-seed-token') seedToken: string) {
    // ── Security layer 1: env flag ─────────────────────────────────────────
    if (process.env.ALLOW_INTERNAL_SEED !== 'true') {
      throw new ForbiddenException('Internal seed is not enabled');
    }

    // ── Security layer 2: one-time token ──────────────────────────────────
    const expectedToken = process.env.INTERNAL_SEED_TOKEN;
    if (!expectedToken || !seedToken || seedToken !== expectedToken) {
      throw new ForbiddenException('Invalid seed token');
    }

    // ── Security layer 3: one-time execution guard ────────────────────────
    const alreadySeeded = await this.prisma.appSetting.findUnique({
      where: { key: 'SEED_COMPLETED_AT' },
    });
    if (alreadySeeded) {
      throw new ForbiddenException(
        `Seed already completed at ${alreadySeeded.value}. Remove ALLOW_INTERNAL_SEED and delete this endpoint.`,
      );
    }

    this.logger.log('Production seed starting...');

    // ── Pre-seed counts ────────────────────────────────────────────────────
    const before = await this.collectCounts();

    const report: string[] = [];

    // ── 1. Admin user (never overwrite existing password) ─────────────────
    const existingAdmin = await this.prisma.adminUser.findFirst({
      where: { email: ADMIN_USER.email, deletedAt: null },
    });
    if (!existingAdmin) {
      await this.prisma.adminUser.create({
        data: {
          email: ADMIN_USER.email,
          name: ADMIN_USER.name,
          password: ADMIN_USER.password,
          role: ADMIN_USER.role as 'super_admin',
          isActive: ADMIN_USER.isActive,
        },
      });
      report.push('admin_user: created');
    } else {
      await this.prisma.adminUser.update({
        where: { id: existingAdmin.id },
        data: { name: ADMIN_USER.name, role: ADMIN_USER.role as 'super_admin', isActive: ADMIN_USER.isActive },
      });
      report.push('admin_user: updated (password preserved)');
    }

    // ── 2. Categories ──────────────────────────────────────────────────────
    const catMap: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      const existing = await this.prisma.category.findFirst({
        where: { name: cat.name, deletedAt: null },
      });
      if (existing) {
        await this.prisma.category.update({
          where: { id: existing.id },
          data: {
            nameEn: cat.nameEn,
            nameHi: cat.nameHi,
            description: cat.description,
            descriptionEn: cat.descriptionEn,
            descriptionHi: cat.descriptionHi,
            icon: cat.icon,
            displayOrder: cat.displayOrder,
            isActive: cat.isActive,
          },
        });
        catMap[cat.name] = existing.id;
      } else {
        const created = await this.prisma.category.create({
          data: {
            name: cat.name,
            nameEn: cat.nameEn,
            nameHi: cat.nameHi,
            description: cat.description,
            descriptionEn: cat.descriptionEn,
            descriptionHi: cat.descriptionHi,
            icon: cat.icon,
            displayOrder: cat.displayOrder,
            isActive: cat.isActive,
          },
        });
        catMap[cat.name] = created.id;
      }
    }
    report.push(`categories: ${CATEGORIES.length} upserted`);

    // ── 3. Subcategories ───────────────────────────────────────────────────
    const subMap: Record<string, string> = {};
    for (const sub of SUBCATEGORIES) {
      const catId = catMap[sub.catName];
      if (!catId) continue;
      const existing = await this.prisma.subcategory.findFirst({
        where: { name: sub.name, categoryId: catId, deletedAt: null },
      });
      if (existing) {
        await this.prisma.subcategory.update({
          where: { id: existing.id },
          data: { displayOrder: sub.displayOrder, isActive: sub.isActive },
        });
        subMap[sub.name] = existing.id;
      } else {
        const created = await this.prisma.subcategory.create({
          data: {
            name: sub.name,
            categoryId: catId,
            displayOrder: sub.displayOrder,
            isActive: sub.isActive,
          },
        });
        subMap[sub.name] = created.id;
      }
    }
    report.push(`subcategories: ${SUBCATEGORIES.length} upserted`);

    // ── 4. Tasks ───────────────────────────────────────────────────────────
    for (const task of TASKS) {
      const catId = catMap[task.catName];
      const subId = subMap[task.subName];
      if (!catId || !subId) continue;

      const existing = await this.prisma.task.findFirst({
        where: { title: task.title, deletedAt: null },
      });

      const taskData = {
        description: task.description ?? null,
        paymentAmount: task.paymentAmount,
        status: task.status,
        displayOrder: task.displayOrder,
        collectionType: task.collectionType,
        requiredOrientation: task.requiredOrientation,
        minimumImageCount: task.minimumImageCount ?? null,
        maximumImageCount: task.maximumImageCount ?? null,
        minimumDurationSeconds: task.minimumDurationSeconds ?? null,
        maximumDurationSeconds: task.maximumDurationSeconds ?? null,
        audioRequired: task.audioRequired,
        pauseAllowed: task.pauseAllowed,
        dos: task.dos,
        donts: task.donts,
        detailedInstructions: task.detailedInstructions ?? null,
        categoryId: catId,
        subcategoryId: subId,
        currency: 'INR',
      };

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.prisma.task.update({ where: { id: existing.id }, data: taskData as any });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.prisma.task.create({ data: { title: task.title, ...taskData } as any });
      }
    }
    report.push(`tasks: ${TASKS.length} upserted`);

    // ── 5. FAQs ────────────────────────────────────────────────────────────
    for (const faq of FAQS) {
      const existing = await this.prisma.faq.findFirst({
        where: { question: faq.question, deletedAt: null },
      });
      if (existing) {
        await this.prisma.faq.update({
          where: { id: existing.id },
          data: {
            answer: faq.answer,
            questionEn: faq.questionEn ?? undefined,
            answerEn: faq.answerEn ?? undefined,
            questionHi: faq.questionHi ?? undefined,
            answerHi: faq.answerHi ?? undefined,
            isActive: faq.isActive,
            displayOrder: faq.displayOrder,
          },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.prisma.faq.create({ data: faq as any });
      }
    }
    report.push(`faqs: ${FAQS.length} upserted`);

    // ── 6. Banners ─────────────────────────────────────────────────────────
    for (const banner of BANNERS) {
      const existing = await this.prisma.banner.findFirst({
        where: { imageUrl: banner.imageUrl, deletedAt: null },
      });
      if (!existing) {
        await this.prisma.banner.create({ data: banner });
        report.push('banners: created 1');
      } else {
        await this.prisma.banner.update({
          where: { id: existing.id },
          data: {
            displayOrder: banner.displayOrder,
            isActive: banner.isActive,
            startDate: banner.startDate,
            endDate: banner.endDate,
          },
        });
        report.push('banners: updated 1');
      }
    }

    // ── 7. Support settings ────────────────────────────────────────────────
    const existingSupport = await this.prisma.supportSettings.findFirst();
    if (!existingSupport) {
      await this.prisma.supportSettings.create({ data: SUPPORT_SETTINGS });
      report.push('support_settings: created');
    } else {
      await this.prisma.supportSettings.update({
        where: { id: existingSupport.id },
        data: SUPPORT_SETTINGS,
      });
      report.push('support_settings: updated');
    }

    // ── 8. App settings (payout, app name, etc.) ──────────────────────────
    for (const s of APP_SETTINGS) {
      await this.prisma.appSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, updatedBy: 'seed-prod' },
        create: { key: s.key, value: s.value, updatedBy: 'seed-prod' },
      });
    }
    report.push(`app_settings: ${APP_SETTINGS.length} upserted`);

    // ── 9. Legal content (Privacy Policy, Terms) ──────────────────────────
    for (const legal of LEGAL_SETTINGS) {
      await this.prisma.appSetting.upsert({
        where: { key: legal.key },
        update: {
          title: legal.title,
          content: legal.content,
          isPublished: legal.isPublished,
          version: legal.version,
          updatedBy: 'seed-prod',
        },
        create: {
          key: legal.key,
          value: '',
          title: legal.title,
          content: legal.content,
          isPublished: legal.isPublished,
          version: legal.version,
          updatedBy: 'seed-prod',
        },
      });
    }
    report.push('legal_settings: 2 upserted (Privacy Policy, Terms & Conditions)');

    // ── 10. Referral settings ──────────────────────────────────────────────
    const existingReferral = await this.prisma.referralSetting.findFirst();
    if (!existingReferral) {
      await this.prisma.referralSetting.create({
        data: { isEnabled: true, rewardAmount: 100.0, message: null },
      });
      report.push('referral_settings: created');
    } else {
      await this.prisma.referralSetting.update({
        where: { id: existingReferral.id },
        data: { isEnabled: true, rewardAmount: 100.0 },
      });
      report.push('referral_settings: updated');
    }

    // ── Post-seed counts ───────────────────────────────────────────────────
    const after = await this.collectCounts();

    // ── Mark completed (one-time guard) ───────────────────────────────────
    await this.prisma.appSetting.create({
      data: {
        key: 'SEED_COMPLETED_AT',
        value: new Date().toISOString(),
        updatedBy: 'seed-prod',
      },
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await this.audit.log('admin.updated' as AuditAction, {
      adminId: undefined,
      adminEmail: 'seed-prod@internal',
    }, {
      entityType: 'seed-prod',
      metadata: {
        completedAt: new Date().toISOString(),
        tablesSeeded: report,
        countsBefore: before,
        countsAfter: after,
      },
    });

    this.logger.log('Production seed completed successfully');

    return {
      ok: true,
      message: 'Seed completed. Remove ALLOW_INTERNAL_SEED env var and delete seed-prod.controller.ts.',
      applied: report,
      before,
      after,
    };
  }

  private async collectCounts() {
    const [cats, subs, tasks, faqs, banners, appSettings, referral] = await Promise.all([
      this.prisma.category.count({ where: { deletedAt: null } }),
      this.prisma.subcategory.count({ where: { deletedAt: null } }),
      this.prisma.task.count({ where: { deletedAt: null } }),
      this.prisma.faq.count({ where: { deletedAt: null } }),
      this.prisma.banner.count({ where: { deletedAt: null } }),
      this.prisma.appSetting.count(),
      this.prisma.referralSetting.count(),
    ]);
    return { cats, subs, tasks, faqs, banners, appSettings, referral };
  }
}
