import Joi from "joi";

export const usernameSchema = Joi.object({ name: Joi.string().required() });

export const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().valid("message", "private_message").required(),
});

export const limitSchema = Joi.object({
  limit: Joi.number().optional().greater(0),
});
