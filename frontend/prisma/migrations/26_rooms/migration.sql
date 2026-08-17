-- Catalogue des salles (configuration/salles) + liens depuis Class et
-- TimetableSession. Le champ texte `room` est conservé (libellé affiché,
-- lieux hors catalogue) ; les libellés existants sont repris dans le
-- catalogue (une salle par nom distinct et par école) et reliés.

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CLASSROOM',
    "capacity" INTEGER,
    "building" TEXT,
    "floor" TEXT,
    "equipment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_schoolId_name_key" ON "Room"("schoolId", "name");
CREATE INDEX "Room_schoolId_idx" ON "Room"("schoolId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "roomId" TEXT;
CREATE INDEX "Class_roomId_idx" ON "Class"("roomId");
ALTER TABLE "Class" ADD CONSTRAINT "Class_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TimetableSession" ADD COLUMN "roomId" TEXT;
CREATE INDEX "TimetableSession_schoolId_roomId_date_idx" ON "TimetableSession"("schoolId", "roomId", "date");
ALTER TABLE "TimetableSession" ADD CONSTRAINT "TimetableSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise des libellés existants : une salle par (école, nom) distinct, type
-- deviné d'après le nom, capacité = plus grande capacité des classes qui
-- l'utilisent (salles de classe uniquement).
INSERT INTO "Room" ("id", "schoolId", "name", "type", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       src."schoolId",
       src."name",
       CASE
         WHEN src."name" ILIKE '%labo%' THEN 'LAB'
         WHEN src."name" ILIKE '%informatique%' OR src."name" ILIKE '%ordinateur%' THEN 'COMPUTER'
         WHEN src."name" ILIKE '%terrain%' OR src."name" ILIKE '%gymnase%' OR src."name" ILIKE '%sport%' THEN 'SPORTS'
         WHEN src."name" ILIKE '%art%' OR src."name" ILIKE '%musique%' THEN 'ARTS'
         ELSE 'CLASSROOM'
       END,
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (t."schoolId", lower(trim(t."room"))) t."schoolId", trim(t."room") AS "name"
  FROM (
    SELECT c."schoolId", c."room" FROM "Class" c WHERE c."room" IS NOT NULL AND trim(c."room") <> ''
    UNION ALL
    SELECT s."schoolId", s."room" FROM "TimetableSession" s WHERE s."room" IS NOT NULL AND trim(s."room") <> ''
  ) t
  ORDER BY t."schoolId", lower(trim(t."room")), t."room"
) src
ON CONFLICT ("schoolId", "name") DO NOTHING;

UPDATE "Class" c
SET "roomId" = r."id"
FROM "Room" r
WHERE r."schoolId" = c."schoolId" AND lower(r."name") = lower(trim(c."room")) AND c."roomId" IS NULL;

UPDATE "TimetableSession" s
SET "roomId" = r."id"
FROM "Room" r
WHERE r."schoolId" = s."schoolId" AND lower(r."name") = lower(trim(s."room")) AND s."roomId" IS NULL;

UPDATE "Room" r
SET "capacity" = sub."cap"
FROM (SELECT "roomId", max("capacity") AS "cap" FROM "Class" WHERE "roomId" IS NOT NULL GROUP BY "roomId") sub
WHERE sub."roomId" = r."id" AND r."type" = 'CLASSROOM' AND r."capacity" IS NULL;
