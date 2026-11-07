import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {TransactionCanceledException} from "@aws-sdk/client-dynamodb"
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);
  
  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  // Validate movie and actor IDs
  if(
    typeof body.movieId !== "number" || !Number.isSafeInteger(body.movieId) || body.movieId <= 0
  ) {
    return response(400, {
      message: "movieId must be a positive integer",
    });
  }

  if(
    typeof body.actorId !== "number" || !Number.isSafeInteger(body.actorId) || body.actorId <= 0
  ) {
    return response(400, {
      message: "actorId must be a positive integer",
    });
  }

  // Validate role details
  if(
    typeof body.roleName !== "string" || body.roleName.trim().length === 0
  ) {
    return response(400, {
      message: "roleName must be a non-empty string",
    });
  }

  if(
    typeof body.roleDescription !== "string" || body.roleDescription.trim().length === 0
  ) {
    return response(400, {
      message: "roleDescription must be a non-empty string",
    });
  }

  // Create the validated role object
  const role: Role = {
    movieId: body.movieId,
    actorId: body.actorId,
    roleName: body.roleName.trim(),
    roleDescription: body.roleDescription.trim(),
  };

  try {
    //  TOD∏O - Add role if its IDs are valid
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // Check that the movie exists
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: movieKey(role.movieId),
                SK: movieKey(role.movieId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },

          // Check that the actor exists
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: actorKey(role.actorId),
                SK: actorKey(role.actorId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },

          // Add the role only if it does not already exist
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: movieKey(role.movieId),
                SK: actorKey(role.actorId),
                ...role,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    console.error("DynamoDB error:", err);

    if(err instanceof TransactionCanceledException){
      const reasons = err.CancellationReasons ?? [];

      if(reasons[0]?.Code === "ConditionalCheckFailed"){
        return response(404, {
          message: "Movie not found",
        });
      }

      if(reasons[1]?.Code === "ConditionalCheckFailed"){
        return response(404, {
          message: "Actor not found",
        });
      }

      if(reasons[2]?.Code === "ConditionalCheckFailed"){
        return response(409, {
          message: "Role already exists",
        });
      }
    }

    return response(500, {
      message: "Internal server error",
    });
  }
};
