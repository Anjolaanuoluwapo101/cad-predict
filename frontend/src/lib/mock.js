import mock from './mockResponse.json';

// Same shape as a real /predict response, so swapping to the API is a one-line change.
export const mockPredict = () =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(mock)), 350));
