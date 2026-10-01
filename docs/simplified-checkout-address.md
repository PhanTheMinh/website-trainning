# Simplified checkout address — current decision

Checkout now collects name, email, phone, Country, Province/State, City and ZIP Code. Street, House number, Apartment/Unit and Ward/District controls have been removed. Checkout no longer mounts the street selector or calls external street providers.

## API / model / database

- Draft validation still accepts optional legacy detailed address fields for compatibility.
- Create-order validation accepts omitted/empty street, defaulting to `''`. The service persists this empty string for new simplified addresses. Other omitted detail fields become `NULL`.
- Existing `customers` and `order_addresses` columns are retained to preserve old profiles and order snapshots. These columns are not removed just because the UI controls are removed.
- Database and models match: street is `VARCHAR(200) NOT NULL`; empty string is valid. House number, apartment and ward are nullable. City remains required, ZIP maps to `postal_code`.
- No new migration is needed for this UI/validation decision. Historical migrations are unchanged; no `sync({force:true})`, reset or drop was performed.
- Customer reuse still does not overwrite the existing profile. Order snapshots still preserve the address supplied for each order.
- Unused street lookup modules/endpoints remain separate compatibility code, but are not part of the active checkout workflow. Do not represent the old street-list plan as the current checkout requirement.

## Limitation

City + ZIP does not identify an exact delivery destination. This simplified form follows the user's current project requirement; it is not sufficient for production doorstep shipping without a later delivery-address collection step.

## Verification

Read-only development DB checks confirmed matching model/database types, nullability and foreign keys for customer/order-address fields. Integration tests create orders and a new customer using the simplified address on the test DB and verify existing customer detail is preserved. A rendered frontend regression test verifies removed controls do not appear.

## Additional audit findings — fixed

The development `orders` table previously permitted NULL for `checkout_id`, `user_id`, and `payment_method_id`, although the model required those fields. Sequelize's MySQL `changeColumnQuery` treats a definition containing `REFERENCES` as an ADD FOREIGN KEY operation rather than a column MODIFY; the historical consolidation migration therefore did not enforce NOT NULL and created duplicate foreign keys for those columns.

Two new forward migrations were applied successfully to **test and development** after approval:

- `20261001170000-enforce-order-required-links.js`: checks for missing references and unexpected types before changing the three columns to NOT NULL, without adding new foreign keys.
- `20261001175000-deduplicate-order-foreign-keys.js`: removes only redundant single-column constraints with identical referenced table/column and identical update/delete rules. One valid foreign key remains per link; differing rules/composite constraints are not removed.

Final development verification found no missing fields/nullability mismatches across the six order-related models. Each required order link is NOT NULL and has exactly one foreign key. Existing order count remains unchanged, with no missing links. Integration tests on the test database verify rejection of both NULL and nonexistent reference IDs. No historical migration was rewritten and no data reset/deletion occurred.
