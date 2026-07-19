# Effectful Operations And Cleanup

Implementation should not ordinarily requisition persistent external resources. Every effectful operation or E2E check owns proportional cleanup of the temporary resources it creates.

Before effect:

- bind explicit authorization, target, scope, duration, and survival boundary;
- classify the resource as temporary, retained evidence, or independently authoritative;
- name cleanup/retention owner, method, expiry, and verification;
- establish required preconditions and rollback/terminal outcomes.

After effect:

- run already-authorized cleanup;
- verify absence or intended retained state from the owning system;
- preserve compact evidence locators;
- treat failed or uncertain cleanup as operation failure/unsettled Runtime fact;
- ask Steward to surface attention when human action is required.

A Work Item or Leg cannot claim success while required cleanup remains unverified. Do not invent universal containment owners, break-glass protocols, resource ledgers, or compensating semantic state. Only evidence changing accepted behavior, Blueprint, or Route invokes semantic invalidation.