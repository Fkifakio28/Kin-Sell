-- Create So-Kin comments table (mobile comments drawer)
CREATE TABLE "SoKinComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "parentCommentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SoKinComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SoKinComment_postId_createdAt_idx" ON "SoKinComment"("postId", "createdAt");
CREATE INDEX "SoKinComment_authorId_createdAt_idx" ON "SoKinComment"("authorId", "createdAt");
CREATE INDEX "SoKinComment_parentCommentId_idx" ON "SoKinComment"("parentCommentId");

ALTER TABLE "SoKinComment"
  ADD CONSTRAINT "SoKinComment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "SoKinPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SoKinComment"
  ADD CONSTRAINT "SoKinComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SoKinComment"
  ADD CONSTRAINT "SoKinComment_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "SoKinComment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
