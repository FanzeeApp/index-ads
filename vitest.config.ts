import { defineConfig } from 'vitest/config';

/** Qamrov chegarasi — jamoa kelishuvi: har bir o'lchov bo'yicha 80%. */
const COVERAGE_THRESHOLD = 80;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Ishga tushirish nuqtasi: jonli Telegram va Postgres talab qiladi,
        // mantiq esa chaqiriladigan modullarda — ular alohida qoplangan.
        'src/index.ts',
        // Faqat matn lug'ati — testga arzimaydi.
        'src/i18n/**',
        // Prisma mijozi generatsiya qilinadi, bu bizning mantiq emas.
        'src/db/client.ts',
      ],
      thresholds: {
        lines: COVERAGE_THRESHOLD,
        functions: COVERAGE_THRESHOLD,
        branches: COVERAGE_THRESHOLD,
        statements: COVERAGE_THRESHOLD,
      },
    },
  },
});
