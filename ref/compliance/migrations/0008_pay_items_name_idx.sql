-- Index on pay_items.name for efficient 13th month and remittance queries
-- (filters like WHERE name = 'Basic Pay' across 240k+ rows at 10k employees)
CREATE INDEX `item_name_idx` ON `pay_items` (`name`);
