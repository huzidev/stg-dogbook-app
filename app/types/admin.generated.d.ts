/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type PostPurchaseOfferQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type PostPurchaseOfferQuery = { shop: { metafield?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>> } };

export type HydrateVariantsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type HydrateVariantsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id' | 'price' | 'compareAtPrice'>
    & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, product: (
      Pick<AdminTypes.Product, 'title'>
      & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }
    ) }
  )>> };

export type ReadUpsellConfigQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ReadUpsellConfigQuery = { shop: { metafield?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>> } };

export type LegacyQueryVariables = AdminTypes.Exact<{
  handle: AdminTypes.MetaobjectHandleInput;
}>;


export type LegacyQuery = { metaobjectByHandle?: AdminTypes.Maybe<{ fields: Array<(
      Pick<AdminTypes.MetaobjectField, 'key' | 'value'>
      & { references?: AdminTypes.Maybe<{ nodes: Array<AdminTypes.Maybe<Pick<AdminTypes.ProductVariant, 'id'>>> }> }
    )> }> };

export type HydrateDisplayQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type HydrateDisplayQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price'>
    & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, product: (
      Pick<AdminTypes.Product, 'title'>
      & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }
    ) }
  )>> };

export type FetchShopIdQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FetchShopIdQuery = { shop: Pick<AdminTypes.Shop, 'id'> };

export type ListFunctionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ListFunctionsQuery = { shopifyFunctions: { nodes: Array<(
      Pick<AdminTypes.ShopifyFunction, 'id' | 'apiType' | 'title'>
      & { app: Pick<AdminTypes.App, 'title'> }
    )> } };

export type ListDiscountsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ListDiscountsQuery = { automaticDiscountNodes: { nodes: Array<(
      Pick<AdminTypes.DiscountAutomaticNode, 'id'>
      & { automaticDiscount: (
        { __typename: 'DiscountAutomaticApp' }
        & Pick<AdminTypes.DiscountAutomaticApp, 'title'>
      ) | { __typename: 'DiscountAutomaticBasic' | 'DiscountAutomaticBxgy' | 'DiscountAutomaticFreeShipping' } }
    )> } };

export type CreateUpsellDiscountMutationVariables = AdminTypes.Exact<{
  discount: AdminTypes.DiscountAutomaticAppInput;
}>;


export type CreateUpsellDiscountMutation = { discountAutomaticAppCreate?: AdminTypes.Maybe<{ automaticAppDiscount?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticApp, 'discountId'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type SetFnConfigMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type SetFnConfigMutation = { metafieldsSet?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message'>> }> };

export type SaveMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type SaveMutation = { metafieldsSet?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message' | 'code'>> }> };

interface GeneratedQueryTypes {
  "#graphql\n    query PostPurchaseOffer {\n      shop { metafield(namespace: \"app\", key: \"post_purchase_offer\") { value } }\n    }": {return: PostPurchaseOfferQuery, variables: PostPurchaseOfferQueryVariables},
  "#graphql\n    query HydrateVariants($ids: [ID!]!) {\n      nodes(ids: $ids) {\n        ... on ProductVariant {\n          id\n          price\n          compareAtPrice\n          image { url altText }\n          product { title featuredImage { url altText } }\n        }\n      }\n    }": {return: HydrateVariantsQuery, variables: HydrateVariantsQueryVariables},
  "#graphql\n    query ReadUpsellConfig { shop { metafield(namespace: \"app\", key: \"post_purchase_offer\") { value } } }\n  ": {return: ReadUpsellConfigQuery, variables: ReadUpsellConfigQueryVariables},
  "#graphql\n    query Legacy($handle: MetaobjectHandleInput!) {\n      metaobjectByHandle(handle: $handle) {\n        fields {\n          key\n          value\n          references(first: 50) { nodes { ... on ProductVariant { id } } }\n        }\n      }\n    }": {return: LegacyQuery, variables: LegacyQueryVariables},
  "#graphql\n    query HydrateDisplay($ids: [ID!]!) {\n      nodes(ids: $ids) {\n        ... on ProductVariant {\n          id\n          title\n          price\n          image { url altText }\n          product { title featuredImage { url altText } }\n        }\n      }\n    }": {return: HydrateDisplayQuery, variables: HydrateDisplayQueryVariables},
  "#graphql\n    query FetchShopId { shop { id } }\n  ": {return: FetchShopIdQuery, variables: FetchShopIdQueryVariables},
  "#graphql\n    query ListFunctions {\n      shopifyFunctions(first: 50) {\n        nodes { id apiType app { title } title }\n      }\n    }\n  ": {return: ListFunctionsQuery, variables: ListFunctionsQueryVariables},
  "#graphql\n    query ListDiscounts {\n      automaticDiscountNodes(first: 50, query: \"status:ACTIVE\") {\n        nodes {\n          id\n          automaticDiscount {\n            __typename\n            ... on DiscountAutomaticApp { title }\n          }\n        }\n      }\n    }\n  ": {return: ListDiscountsQuery, variables: ListDiscountsQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n    mutation CreateUpsellDiscount($discount: DiscountAutomaticAppInput!) {\n      discountAutomaticAppCreate(automaticAppDiscount: $discount) {\n        automaticAppDiscount { discountId }\n        userErrors { field message }\n      }\n    }": {return: CreateUpsellDiscountMutation, variables: CreateUpsellDiscountMutationVariables},
  "#graphql\n    mutation SetFnConfig($metafields: [MetafieldsSetInput!]!) {\n      metafieldsSet(metafields: $metafields) {\n        userErrors { field message }\n      }\n    }": {return: SetFnConfigMutation, variables: SetFnConfigMutationVariables},
  "#graphql\n    mutation Save($metafields: [MetafieldsSetInput!]!) {\n      metafieldsSet(metafields: $metafields) {\n        userErrors { field message code }\n      }\n    }": {return: SaveMutation, variables: SaveMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
