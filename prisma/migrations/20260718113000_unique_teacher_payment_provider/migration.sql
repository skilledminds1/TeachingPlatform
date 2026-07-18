-- Prevent a teacher from linking the same payment provider more than once.
CREATE UNIQUE INDEX "teacher_payment_accounts_user_id_provider_key"
ON "teacher_payment_accounts"("user_id", "provider");
