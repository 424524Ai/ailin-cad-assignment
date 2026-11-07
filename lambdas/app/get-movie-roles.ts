import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ddb,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
  actorKey,
  isMovieItem,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }

  const actorParam = event.queryStringParameters?.actor;
  const actorId = actorParam === undefined ? undefined : parseId(actorParam);

  if (actorParam !== undefined && actorId === undefined) {
    return response(400, {
      message: "actor must be a positive integer",
    });
  }
  try {
    if (actorId !== undefined) {
      // Check whether the movie exists
      const movieResult = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: {
          PK: movieKey(movieId),
          SK:movieKey(movieId),
        },
      }));

      if(!movieResult.Item || !isMovieItem(movieResult.Item)){
        return response(404, {
          message: "Movie not found",
        });
      }

      // Find the specified actor's role in the movie
      const roleResult = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: {
          PK: movieKey(movieId),
          SK: actorKey(actorId),
        },
      }));

      const role = roleResult.Item;
      return response(200, {data: role && isRoleItem(role) ? [toRole(role)] : [], });
    }
    const queryResult = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": movieKey(movieId) },
        // ExclusiveStartKey: lastKey,
      })
    );

    const resultItems = queryResult.Items ?? [];
    // Check whether the movie exists
    const movieExists = resultItems.some(isMovieItem);

    if(!movieExists){
      return response(404, {message: "Movie not found"});
    }
    // Return the roles associated with the movie
    return response(200, { data: resultItems.filter(isRoleItem).map(toRole) });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
    });
  }
};
