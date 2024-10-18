export const sleep = async (duration: number): Promise<void> => {
  return await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
};
