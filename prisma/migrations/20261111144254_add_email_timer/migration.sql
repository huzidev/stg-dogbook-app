-- CreateTable
CREATE TABLE "EmailTimer" (
    "token" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTimer_pkey" PRIMARY KEY ("token")
);
