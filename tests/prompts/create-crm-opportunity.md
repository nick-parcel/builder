# create-crm-opportunity live prompts

## Should trigger

- Create an opportunity for 101 Main St on the developer's account.
- Add these three projects to HubSpot as deals.
- Log the Quincy Center project in Salesforce.
- Put this project under the architect's account in the CRM.

## Should not trigger

- Write an email to that developer. (research-and-write-outreach)

## Behavior checks

- Asks which account when none is named, listing the project's firms with nothing preselected.
- Searches the account's existing opportunities first and proposes an update on a match.
- Leaves the amount blank without a fee percentage; never uses construction cost as the amount.
- Every CRM write and the `in-crm` tag wait for approval.
