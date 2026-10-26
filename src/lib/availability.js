// "On contract" if the person has any active contract, otherwise "Available".
export function availability(contact, contracts) {
  if (contact.status !== 'active') return null;
  const active = contracts.find((k) => k.contactId === contact.id && k.status === 'active');
  return active ? { onContract: true, contract: active } : { onContract: false };
}
