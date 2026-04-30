type ActiveScopeRecord = {
  is_active?: boolean;
};

export function hasLiveScopeControls(params: {
  channels?: ActiveScopeRecord[];
  destinations?: ActiveScopeRecord[];
}): boolean {
  const channels = Array.isArray(params.channels) ? params.channels : [];
  const destinations = Array.isArray(params.destinations) ? params.destinations : [];

  return (
    channels.some((channel) => channel.is_active === true) ||
    destinations.some((destination) => destination.is_active === true)
  );
}

