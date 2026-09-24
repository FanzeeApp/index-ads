# ─────────────────────────────────────────────────────────────────────────────
#  ZAXIRA VARIANT — odatiy joylash Nixpacks orqali ketadi (nixpacks.toml).
#
#  Bu Dockerfile faqat quyidagi hollarda kerak bo'ladi:
#    • Railway da "Builder: Dockerfile" ni qo'lda tanlasangiz;
#    • boshqa platformaga (Fly.io, Render, o'z VPS ingiz) ko'chirsangiz;
#    • Nixpacks avtomatik aniqlovi biror sababga ko'ra ishlamay qolsa.
#
#  Railway da uni yoqish: Settings → Build → Builder → Dockerfile.
#  Shunda railway.json dagi `build.builder` ni ham "DOCKERFILE" ga o'zgartiring.
# ─────────────────────────────────────────────────────────────────────────────

# ── 1-bosqich: qurish ────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Prisma query engine OpenSSL ga tayanadi — alpine emas, slim tanlangani shundan.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Avval faqat manifestlar: kod o'zgarganda npm keshi buzilmasin.
COPY package.json package-lock.json ./

# --ignore-scripts: postinstall dagi `prisma generate` hali schema ko'chirilmagani
# uchun yiqilardi; generate quyida, kod ko'chirilgandan keyin aniq chaqiriladi.
# --include=dev: NODE_ENV=production bo'lsa npm devDependencies ni tashlab ketadi,
# natijada tsc topilmay build yiqiladi.
RUN npm ci --include=dev --ignore-scripts

COPY . .

RUN npx prisma generate && npm run build

# ── 2-bosqich: ishga tushirish ───────────────────────────────────────────────
FROM node:20-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Butun /app ko'chiriladi (node_modules bilan birga) — ataylab:
#   • `prisma migrate deploy` uchun Prisma CLI ishga tushishda kerak;
#   • Mini App ning statik fayllari (HTML/CSS/JS) dist ga kompilyatsiya
#     qilinmaydi, ular o'z joyida qoladi va shu nusxa bilan birga keladi.
COPY --from=builder --chown=node:node /app ./

USER node

EXPOSE 3000

# Railway healthcheck ni o'zi qiladi; bu boshqa platformalar uchun.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npm run prisma:migrate && npm start"]
