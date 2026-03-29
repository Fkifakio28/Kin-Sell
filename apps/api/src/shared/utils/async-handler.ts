import { NextFunction, Request, Response } from "express";

export const asyncHandler = (
  fn: (request: Request, response: Response, next: NextFunction) => Promise<void>
) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    void fn(request, response, next).catch(next);
  };
};
